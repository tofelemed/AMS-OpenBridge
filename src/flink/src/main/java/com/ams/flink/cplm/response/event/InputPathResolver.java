package com.ams.flink.cplm.response.event;

/** Which applied input a path model may be fitted against (spec §2.3). A cascade master's OP is a set-point for the slave, never a valve command. */
public final class InputPathResolver {
    public enum Path { OP_TO_PV, VP_TO_PV, SLAVE_SP_TO_PV, EXOGENOUS_TEST }

    public static final class Resolution {
        public final Path path;
        public final boolean uAppliedAvailable;
        public final String reason;

        Resolution(Path path, boolean uAppliedAvailable, String reason) {
            this.path = path;
            this.uAppliedAvailable = uAppliedAvailable;
            this.reason = reason;
        }
    }

    private InputPathResolver() {}

    public static Resolution resolve(String commandPath, boolean vpMapped, boolean approvedTestRecord) {
        String cp = commandPath == null ? "UNKNOWN" : commandPath;
        if (approvedTestRecord) return new Resolution(Path.EXOGENOUS_TEST, true, "APPROVED_TEST_RECORD");
        switch (cp) {
            case "OP_TO_SLAVE_SP":
                return new Resolution(Path.SLAVE_SP_TO_PV, false, "CASCADE_MASTER_OP_IS_NOT_AN_APPLIED_INPUT");
            case "OP_TO_VALVE":
            case "OP_TO_VFD":
                return vpMapped
                        ? new Resolution(Path.VP_TO_PV, true, "VP_IS_THE_APPLIED_INPUT")
                        : new Resolution(Path.OP_TO_PV, true, "OP_ASSUMED_APPLIED");
            default:
                return new Resolution(Path.OP_TO_PV, false, "COMMAND_PATH_UNKNOWN");
        }
    }
}
