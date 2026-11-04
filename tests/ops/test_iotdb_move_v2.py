"""Offline tests for migration/iotdb_move_v2.py (CHG-101 x CHG-102 layout v2 move). No IoTDB needed.

Run:  python -I tests/ops/test_iotdb_move_v2.py -v
"""
import importlib.util
import os
import sys
import types
import unittest
import unittest.mock

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
spec = importlib.util.spec_from_file_location("movetool", os.path.join(ROOT, "migration", "iotdb-move-loop-tree.py"))
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)
v2 = sys.modules["iotdb_move_v2"]

RAW = {"pv": "FLOAT", "sp": "FLOAT", "op": "FLOAT", "vp": "FLOAT", "mode": "TEXT"}
SHORT = {"sample_count": "FLOAT", "mae": "FLOAT", "completeness": "FLOAT", "engine": "TEXT"}
GATE = {"mae": "FLOAT", "diagnosis": "TEXT", "severity": "TEXT"}


class FakeDb:
    """Answers the three template-introspection queries and SHOW DATABASES."""

    def __init__(self, templates=None, mounts=None, dbs=("root.hdpe.cpm", "root.hdpe.kpi", "root.hdpe.kpis")):
        self.templates = templates or {"cpm_raw": RAW, "cpm_kpi_short": SHORT, "cpm_kpi_gate": GATE}
        self.mounts = mounts or {"cpm_raw": ["root.hdpe.cpm"],
                                 "cpm_kpi_short": ["root.hdpe.kpis.short_5m"],
                                 "cpm_kpi_gate": ["root.hdpe.kpi.gate_24h"]}
        self.dbs = dbs

    def query(self, sql):
        if sql == "show device templates":
            return {"column_names": ["TemplateName"], "values": [list(self.templates)]}
        if sql == "show databases":
            return {"column_names": ["Database", "TTL"], "values": [list(self.dbs), [1] * len(self.dbs)]}
        name = sql.split()[-1]
        if sql.startswith("show nodes in device template"):
            t = self.templates[name]
            return {"column_names": ["ChildNodes", "DataType"], "values": [list(t), list(t.values())]}
        if sql.startswith("show paths set device template"):
            return {"column_names": ["Paths"], "values": [self.mounts.get(name, [])]}
        raise AssertionError(f"unexpected query: {sql}")


def args(layout="v2", old="root.site1.cpm", new="root.hdpe.cpm"):
    return types.SimpleNamespace(layout=layout, old=old, new=new, kpi_db="root.hdpe.kpi",
                                 kpis_db="root.hdpe.kpis", loop=[])


class LayoutMapping(unittest.TestCase):
    def test_forward_flips_kpi_devices_to_family_then_loop(self):
        lay = v2.Layout(h, args())
        self.assertEqual(lay.target("root.site1.cpm.FIC10401"), "root.hdpe.cpm.FIC10401")
        self.assertEqual(lay.target("root.site1.cpm.FIC10401.kpi.gate_12h"), "root.hdpe.kpi.gate_12h.FIC10401")
        self.assertEqual(lay.target("root.site1.cpm.FIC10401.kpi.long_4h"), "root.hdpe.kpi.long_4h.FIC10401")
        self.assertEqual(lay.target("root.site1.cpm.FIC10401.kpi.short_1m"), "root.hdpe.kpis.short_1m.FIC10401")

    def test_forward_refuses_an_unknown_device_shape(self):
        lay = v2.Layout(h, args())
        for dev in ("root.site1.cpm.FIC10401.kpi", "root.site1.cpm.FIC10401.extra.x",
                    "root.site1.cpm.FIC10401.kpi.weird"):
            with self.assertRaises(v2.Refused, msg=dev):
                lay.target(dev)

    def test_back_maps_to_the_legacy_shape_and_skips_the_rollup(self):
        lay = v2.Layout(h, args("v2-back", old="root.hdpe.cpm", new="root.site1.cpm"))
        self.assertEqual(lay.target("root.hdpe.cpm.FIC10401"), "root.site1.cpm.FIC10401")
        self.assertEqual(lay.target("root.hdpe.kpi.gate_24h.FIC10401"), "root.site1.cpm.FIC10401.kpi.gate_24h")
        self.assertEqual(lay.target("root.hdpe.kpis.short_60m.FIC10401"), "root.site1.cpm.FIC10401.kpi.short_60m")
        self.assertTrue(lay.skip("root.hdpe.kpi.m1.FIC10401"))
        self.assertFalse(lay.skip("root.hdpe.kpi.gate_24h.FIC10401"))


class Statements(unittest.TestCase):
    def planner(self, db=None):
        return v2.Planner(h, db or FakeDb(), args())

    def test_raw_casts_double_to_float_writes_aligned_and_never_back_quotes(self):
        target, sql = self.planner().statement(
            "root.site1.cpm.FIC10401", {"pv": "DOUBLE", "sp": "DOUBLE", "mode": "TEXT"}, 10, 20)
        self.assertEqual(target, "root.hdpe.cpm.FIC10401")
        self.assertEqual(sql, "select mode, cast(pv AS FLOAT), cast(sp AS FLOAT) into aligned "
                              "root.hdpe.cpm.FIC10401(mode, pv, sp) from root.site1.cpm.FIC10401 "
                              "where time >= 10 and time < 20")
        self.assertNotIn("`", sql)

    def test_kpi_text_fields_copy_without_a_cast(self):
        _, sql = self.planner().statement("root.site1.cpm.FIC10401.kpi.gate_24h",
                                          {"mae": "DOUBLE", "diagnosis": "TEXT"}, 0, 1)
        self.assertIn("select diagnosis, cast(mae AS FLOAT) into aligned root.hdpe.kpi.gate_24h.FIC10401", sql)

    def test_a_field_outside_the_template_is_refused(self):
        with self.assertRaisesRegex(v2.Refused, "auto-extend"):
            self.planner().statement("root.site1.cpm.FIC10401.kpi.gate_24h", {"new_kpi": "DOUBLE"}, 0, 1)

    def test_a_family_without_a_mounted_template_is_refused(self):
        with self.assertRaisesRegex(v2.Refused, "no device template set on root.hdpe.kpi.gate_4h"):
            self.planner().statement("root.site1.cpm.FIC10401.kpi.gate_4h", {"mae": "DOUBLE"}, 0, 1)

    def test_text_to_number_is_refused(self):
        with self.assertRaisesRegex(v2.Refused, "TEXT -> FLOAT"):
            self.planner().statement("root.site1.cpm.FIC10401", {"pv": "TEXT"}, 0, 1)

    def test_a_non_identifier_measurement_is_refused(self):
        with self.assertRaisesRegex(v2.Refused, "plain identifier"):
            v2.q("`pv`")

    def test_a_polluted_template_stops_the_run(self):
        bad = dict(RAW, **{"`pv`": "FLOAT"})
        p = self.planner(FakeDb(templates={"cpm_raw": bad, "cpm_kpi_short": SHORT, "cpm_kpi_gate": GATE}))
        with self.assertRaises(SystemExit) as e:
            p.check_targets_exist()
        self.assertEqual(e.exception.code, 2)

    def test_missing_kpi_database_stops_the_run(self):
        p = self.planner(FakeDb(dbs=("root.hdpe.cpm",)))
        with self.assertRaises(SystemExit):
            p.check_targets_exist()


class Retries(unittest.TestCase):
    def run_with(self, *errors):
        """Fails with each error in turn, then answers. Returns (result, calls made)."""
        db = h.IoTDB("u", "p", "http://x", None, retries=4, pause_ms=0)
        calls = []

        def once(endpoint, sql):
            calls.append(sql)
            if len(calls) <= len(errors):
                raise errors[len(calls) - 1]
            return {"code": 200}

        db._post_once = once
        with unittest.mock.patch.object(h.time, "sleep"):
            return db._post("nonQuery", "select 1"), len(calls)

    def test_the_two_v2_first_run_failures_are_retried(self):
        region = h.IoTDBError("IoTDB 500: There are no available DataRegionGroup RegionGroups currently", 500)
        npe = h.IoTDBError("IoTDB 301: java.lang.NullPointerException at Driver.processInternal", 301)
        self.assertEqual(self.run_with(region, npe)[1], 3)

    def test_an_ordinary_sql_error_is_not_retried(self):
        with self.assertRaises(h.IoTDBError):
            self.run_with(h.IoTDBError("IoTDB 700: syntax error", 700))

    def test_retries_run_out(self):
        npe = h.IoTDBError("IoTDB 301: NullPointerException", 301)
        with self.assertRaises(h.IoTDBError):
            self.run_with(*[npe] * 5)


class Tolerance(unittest.TestCase):
    def test_float_rounding_is_equal_but_a_real_difference_is_not(self):
        self.assertTrue(v2._close(13.28196461568901, 13.281964))
        self.assertFalse(v2._close(13.28, 13.29))
        self.assertTrue(v2._close(None, None))
        self.assertFalse(v2._close(1.0, None))


if __name__ == "__main__":
    unittest.main()
