import React, { Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import './Designer.css';

const DisplayDesigner = React.lazy(() =>
  import('./DisplayDesigner').then(m => ({ default: m.DisplayDesigner }))
);

export const DesignerPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  if (!id) {
    return (
      <div className="designer-page-error">
        <h2>Display Not Found</h2>
        <p>No display ID provided</p>
        <button onClick={() => navigate('/designer')}>
          Back to Display List
        </button>
      </div>
    );
  }
  
  return (
    <Suspense fallback={
      <div className="designer-page-loading">
        <div className="symbol-loading__spinner" />
        <p>Loading designer…</p>
      </div>
    }>
      <DisplayDesigner
        displayId={id}
        onClose={() => navigate('/designer')}
        onSave={() => {
          // Optionally show a success notification
        }}
      />
    </Suspense>
  );
};

export default DesignerPage;
