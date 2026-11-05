/** Overview: a KPI's drill-down opens in place, on Overview's own address (page-plan.md, decision 3). */
import React from 'react';
import { useSearchParams } from 'react-router-dom';

const CpmOverview = React.lazy(() => import('../../components/Cpm/CpmOverview'));
const CpmKpiDrilldown = React.lazy(() => import('../../components/Cpm/CpmKpiDrilldown'));

const OverviewPage: React.FC = () => {
  const [params] = useSearchParams();
  return params.has('review') ? <CpmKpiDrilldown /> : <CpmOverview />;
};

export default OverviewPage;
