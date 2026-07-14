import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../api/apiFetch';

const TEMPLATE_SERVICE_URL = import.meta.env.VITE_TEMPLATE_SERVICE_URL || '/api/templates';

interface Template {
  id: string;
  name: string;
  category: string;
  description?: string;
  icon?: string;
  publishedVersion?: number;
  isSystem: boolean;
  parameters: { name: string; label: string; type: string; required: boolean }[];
}

interface TemplatePaletteProps {
  onInstantiateTemplate: (templateId: string, parameters: Record<string, string>, position: { x: number; y: number }) => void;
}

const fetchTemplates = async (): Promise<{ templates: Template[] }> => {
  const res = await apiFetch(`${TEMPLATE_SERVICE_URL}/templates`);
  if (!res.ok) throw new Error('Failed to load templates');
  return res.json();
};

export const TemplatePalette: React.FC<TemplatePaletteProps> = ({ onInstantiateTemplate }) => {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [parameterValues, setParameterValues] = useState<Record<string, string>>({});
  
  const { data, isLoading, error } = useQuery({
    queryKey: ['templates'],
    queryFn: fetchTemplates
  });
  
  const categories = data?.templates
    ? [...new Set(data.templates.map(t => t.category))]
    : [];
  
  const handleDragStart = (e: React.DragEvent, template: Template) => {
    e.dataTransfer.setData('application/template-id', template.id);
    e.dataTransfer.setData('application/template-name', template.name);
    e.dataTransfer.effectAllowed = 'copy';
  };
  
  const handleTemplateSelect = (template: Template) => {
    setSelectedTemplate(template);
    // Initialize parameter values with defaults
    const defaults: Record<string, string> = {};
    template.parameters.forEach(p => {
      defaults[p.name] = '';
    });
    setParameterValues(defaults);
  };
  
  const handleInstantiate = () => {
    if (!selectedTemplate) return;
    
    // Validate required parameters
    const missingRequired = selectedTemplate.parameters
      .filter(p => p.required && !parameterValues[p.name]);
    
    if (missingRequired.length > 0) {
      alert(`Missing required parameters: ${missingRequired.map(p => p.label).join(', ')}`);
      return;
    }
    
    onInstantiateTemplate(selectedTemplate.id, parameterValues, { x: 100, y: 100 });
    setSelectedTemplate(null);
    setParameterValues({});
  };
  
  if (isLoading) {
    return <div className="template-palette template-palette--loading">Loading templates...</div>;
  }
  
  if (error) {
    return <div className="template-palette template-palette--error">Failed to load templates</div>;
  }
  
  return (
    <div className="template-palette">
      <div className="template-palette__header">
        <h3>Templates</h3>
      </div>
      
      {categories.map(category => (
        <div key={category} className="template-palette__category">
          <button
            className="template-palette__category-header"
            onClick={() => setExpandedCategory(expandedCategory === category ? null : category)}
          >
            <span>{expandedCategory === category ? '▼' : '▶'}</span>
            <span>{category}</span>
            <span className="template-palette__category-count">
              {data?.templates.filter(t => t.category === category).length}
            </span>
          </button>
          
          {expandedCategory === category && (
            <div className="template-palette__templates">
              {data?.templates
                .filter(t => t.category === category)
                .map(template => (
                  <div
                    key={template.id}
                    className={`template-palette__item ${!template.publishedVersion ? 'template-palette__item--draft' : ''}`}
                    draggable={!!template.publishedVersion}
                    onDragStart={(e) => handleDragStart(e, template)}
                    onClick={() => handleTemplateSelect(template)}
                    title={template.description || template.name}
                  >
                    <div className="template-palette__item-icon">
                      {template.icon || '📦'}
                    </div>
                    <div className="template-palette__item-info">
                      <div className="template-palette__item-name">{template.name}</div>
                      {template.isSystem && (
                        <span className="template-palette__item-badge">System</span>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      ))}
      
      {/* Parameter Dialog */}
      {selectedTemplate && (
        <div className="template-dialog-overlay" onClick={() => setSelectedTemplate(null)}>
          <div className="template-dialog" onClick={e => e.stopPropagation()}>
            <div className="template-dialog__header">
              <h4>Instantiate: {selectedTemplate.name}</h4>
              <button onClick={() => setSelectedTemplate(null)}>×</button>
            </div>
            
            <div className="template-dialog__content">
              {selectedTemplate.description && (
                <p className="template-dialog__description">{selectedTemplate.description}</p>
              )}
              
              <div className="template-dialog__parameters">
                {selectedTemplate.parameters.map(param => (
                  <div key={param.name} className="template-dialog__param">
                    <label>
                      {param.label}
                      {param.required && <span className="required">*</span>}
                    </label>
                    <input
                      type={param.type === 'number' ? 'number' : 'text'}
                      value={parameterValues[param.name] || ''}
                      onChange={(e) => setParameterValues(prev => ({
                        ...prev,
                        [param.name]: e.target.value
                      }))}
                      placeholder={
                        param.type === 'path'
                          ? 'houston/crude1/pump101'
                          : `Enter ${param.label.toLowerCase()}`
                      }
                    />
                    {param.type === 'path' && (
                      <div className="template-dialog__hint">
                        UNS contextual path (e.g., site/unit/device)
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            
            <div className="template-dialog__actions">
              <button onClick={() => setSelectedTemplate(null)}>Cancel</button>
              <button className="btn-primary" onClick={handleInstantiate}>
                Add to Canvas
              </button>
            </div>
          </div>
        </div>
      )}
      
      <div className="template-palette__hint">
        Click to configure, or drag published templates to canvas
      </div>
    </div>
  );
};

export default TemplatePalette;
