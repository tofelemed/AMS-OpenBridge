import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DisplayDesigner } from './DisplayDesigner';
import './Designer.css';

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
    <DisplayDesigner
      displayId={id}
      onClose={() => navigate('/designer')}
      onSave={() => {
        // Optionally show a success notification
      }}
    />
  );
};

export default DesignerPage;
