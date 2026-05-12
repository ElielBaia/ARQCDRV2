import React from 'react';
import { PBIMProject } from '../lib/pbim/schema';
import { User, MapPin, Briefcase, FileText, Save } from 'lucide-react';

interface MetadataEditorProps {
  project: PBIMProject;
  onUpdate: (project: PBIMProject) => void;
}

export const MetadataEditor: React.FC<MetadataEditorProps> = ({ project, onUpdate }) => {
  const handleChange = (field: string, value: string) => {
    const updatedProject = {
      ...project,
      metadata: {
        ...project.metadata,
        [field]: value
      }
    };
    onUpdate(updatedProject);
  };

  const handleNameChange = (value: string) => {
    onUpdate({ ...project, name: value });
  };

  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="flex flex-col gap-2">
        <label className="font-mono text-[10px] uppercase text-black/40 font-bold tracking-widest flex items-center gap-2">
          <FileText size={12} /> Project Name
        </label>
        <input
          type="text"
          className="w-full p-2 font-sans text-sm border border-black focus:outline-none focus:ring-1 focus:ring-black bg-white"
          value={project.name}
          onChange={(e) => handleNameChange(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="font-mono text-[10px] uppercase text-black/40 font-bold tracking-widest flex items-center gap-2">
          <Briefcase size={12} /> Client Name
        </label>
        <input
          type="text"
          className="w-full p-2 font-sans text-sm border border-black focus:outline-none focus:ring-1 focus:ring-black bg-white"
          value={project.metadata?.client || ''}
          onChange={(e) => handleChange('client', e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="font-mono text-[10px] uppercase text-black/40 font-bold tracking-widest flex items-center gap-2">
          <MapPin size={12} /> Project Address
        </label>
        <input
          type="text"
          className="w-full p-2 font-sans text-sm border border-black focus:outline-none focus:ring-1 focus:ring-black bg-white"
          value={project.metadata?.address || ''}
          onChange={(e) => handleChange('address', e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="font-mono text-[10px] uppercase text-black/40 font-bold tracking-widest flex items-center gap-2">
          <User size={12} /> Author / Responsible
        </label>
        <input
          type="text"
          className="w-full p-2 font-sans text-sm border border-black focus:outline-none focus:ring-1 focus:ring-black bg-white"
          value={project.metadata?.author || ''}
          onChange={(e) => handleChange('author', e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="font-mono text-[10px] uppercase text-black/40 font-bold tracking-widest flex items-center gap-2">
          <Save size={12} /> Description / Notes
        </label>
        <textarea
          className="w-full p-2 font-sans text-sm border border-black focus:outline-none focus:ring-1 focus:ring-black bg-white resize-none"
          rows={4}
          value={project.metadata?.description || ''}
          onChange={(e) => handleChange('description', e.target.value)}
        />
      </div>
    </div>
  );
};
