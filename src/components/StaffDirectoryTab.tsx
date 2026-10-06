import React from 'react';
import { useApp } from '../context/AppContext';
import { formatINR } from '../utils/formatters';
import { Briefcase, Award, Shield } from 'lucide-react';

export const StaffDirectoryTab: React.FC = () => {
  const { staffList, departments } = useApp();

  return (
    <div className="space-y-8 pb-12">
      {departments.map(dept => {
        const deptStaff = staffList.filter(s => s.dept === dept.name);
        if (deptStaff.length === 0) return null;

        return (
          <div key={dept.name} className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#1b7a54] text-white flex items-center justify-center font-bold shadow-xs">
                  {dept.name.charAt(0)}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">{dept.name} Department</h3>
                  <p className="text-xs text-slate-500">
                    Monthly Target: <span className="font-mono font-semibold text-slate-700">{formatINR(dept.target)}</span> · {deptStaff.length} team members
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {deptStaff.map(stf => (
                <div
                  key={stf.id}
                  className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 border-l-4 border-l-[#1b7a54] hover:shadow-md transition-all flex flex-col justify-between gap-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center font-bold text-slate-700 shadow-inner">
                        {stf.name.charAt(0)}
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 text-base">{stf.name}</h4>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold mt-0.5 ${
                            stf.role === 'Incharge'
                              ? 'bg-purple-50 text-purple-700'
                              : 'bg-blue-50 text-blue-700'
                          }`}
                        >
                          {stf.role}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs text-slate-600">
                    <div className="flex items-center gap-2">
                      <Briefcase className="w-4 h-4 text-slate-400 shrink-0" />
                      <span className="font-medium text-slate-700">{stf.designation}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Award className="w-4 h-4 text-slate-400 shrink-0" />
                      <span>Project: <strong className="text-slate-900">{stf.project}</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-slate-400 shrink-0" />
                      <span>Individual Target: <strong className="font-mono text-slate-900">{formatINR(stf.individualTarget)}</strong></span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};
