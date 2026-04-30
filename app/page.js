'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './lib/supabase';
import * as XLSX from 'xlsx';
import { 
  LayoutDashboard, FileText, Upload, Download, Search, 
  LogOut, ChevronLeft, ChevronRight, Save, Plus, Clock, 
  CheckCircle2, AlertCircle, Trash2, Filter, RefreshCcw, X, CheckSquare, Square
} from 'lucide-react';

const USUARIOS = [
  { user: 'Administrador', pass: 'admin123' },
  { user: 'Yanina', pass: '123456' },
  { user: 'Cesar', pass: '123456' },
  { user: 'Xina', pass: '123456' },
  { user: 'Fernando', pass: '123456' }
];

export default function SistemaSIGERED() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [docs, setDocs] = useState([]);
  const [totalDocs, setTotalDocs] = useState(0);
  const [page, setPage] = useState(1);
  const [view, setView] = useState('dashboard');
  const [editingDoc, setEditingDoc] = useState(null);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [loginData, setLoginData] = useState({ user: '', pass: '' });
  
  // SELECCIÓN MASIVA
  const [selectedIds, setSelectedIds] = useState([]);

  // FILTROS GLOBALES (Dashboard + Gestión)
  const [filters, setFilters] = useState({ 
    search: '', sede: '', etapa: '', estado: '', origen: '', responsable: '', fechaDesde: '', fechaHasta: '' 
  });

  const ITEMS_PER_PAGE = 100;

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    let from = (page - 1) * ITEMS_PER_PAGE;
    let to = from + ITEMS_PER_PAGE - 1;

    let query = supabase.from('documentos').select('*', { count: 'exact' });

    if (filters.search) query = query.or(`cut.ilike.%${filters.search}%,documento.ilike.%${filters.search}%`);
    if (filters.sede) query = query.eq('sede', filters.sede);
    if (filters.etapa) query = query.eq('etapa_actual', filters.etapa);
    if (filters.estado) query = query.eq('estado_final', filters.estado);
    if (filters.origen) query = query.eq('origen', filters.origen);
    if (filters.responsable) query = query.eq('responsable_verificacion', filters.responsable);
    if (filters.fechaDesde) query = query.gte('fecha_registro', filters.fechaDesde);
    if (filters.fechaHasta) query = query.lte('fecha_registro', filters.fechaHasta);

    const { data, count, error } = await query.order('creado_at', { ascending: false }).range(from, to);
    
    if (!error) { 
      setDocs(data); 
      setTotalDocs(count); 
    }
    setLoading(false);
  }, [page, filters]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  // LOGICA DE SELECCIÓN
  const toggleSelectAll = () => {
    if (selectedIds.length === docs.length) setSelectedIds([]);
    else setSelectedIds(docs.map(d => d.id));
  };

  const toggleSelectDoc = (id) => {
    if (selectedIds.includes(id)) setSelectedIds(selectedIds.filter(i => i !== id));
    else setSelectedIds([...selectedIds, id]);
  };

  // ACCIONES MASIVAS
  const handleBulkDelete = async () => {
    if (session.user !== 'Administrador') return alert("Acceso denegado");
    if (confirm(`¿Eliminar ${selectedIds.length} registros?`)) {
      const { error } = await supabase.from('documentos').delete().in('id', selectedIds);
      if (!error) { setSelectedIds([]); fetchDocs(); }
    }
  };

  const handleBulkAssign = async (name) => {
    if (!name) return;
    const { error } = await supabase.from('documentos').update({ responsable_verificacion: name }).in('id', selectedIds);
    if (!error) { alert("Asignación completada"); setSelectedIds([]); fetchDocs(); }
  };

  // EXPORTAR EXCEL (MÓDULO REPORTES)
  const handleExport = (all = false) => {
    const dataToExport = all ? docs : docs; // En un sistema real aquí se haría un fetch sin range si all=true
    const ws = XLSX.utils.json_to_sheet(docs);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reporte_SIGERED");
    XLSX.writeFile(wb, `Reporte_${all ? 'General' : 'Filtrado'}.xlsx`);
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const data = XLSX.utils.sheet_to_json(XLSX.read(evt.target.result, { type: 'binary' }).Sheets[XLSX.read(evt.target.result, { type: 'binary' }).SheetNames[0]], { header: 1 });
      const batch = data.slice(1).map(row => ({
        sede: row[0], cut: String(row[1] || ''), documento: String(row[2] || ''), remitente: row[3],
        fecha_registro: row[4], origen: row[5], responsable_verificacion: row[8],
        estado_final: row[28] || 'PENDIENTE', etapa_actual: row[28] === 'RECUPERADO' ? 'CIERRE' : 'VERIFICACION'
      })).filter(d => d.cut);
      await supabase.from('documentos').upsert(batch, { onConflict: 'cut,documento' });
      fetchDocs();
    };
    reader.readAsBinaryString(file);
  };

  const getStatusStyles = (doc) => {
    if (!doc.cargado_sisged && doc.etapa_actual !== 'VERIFICACION') return { label: 'EN PROCESO', bg: 'bg-orange-100 text-orange-700' };
    switch (doc.estado_final) {
      case 'RECUPERADO': return { label: 'RECUPERADO', bg: 'bg-green-100 text-green-700' };
      case 'RECONSTRUCCION': return { label: 'RECONSTRUCCION', bg: 'bg-gray-100 text-gray-700' };
      default: return { label: 'PENDIENTE', bg: 'bg-red-100 text-red-700' };
    }
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden">
          <div className="bg-blue-600 p-10 text-center text-white">
            <h1 className="text-3xl font-black">SIGERED</h1>
            <p className="text-xs uppercase mt-2 opacity-80">Recuperación de Documentos</p>
          </div>
          <form onSubmit={handleLogin} className="p-10 space-y-4">
            <input type="text" placeholder="Usuario" className="w-full p-4 border rounded-xl outline-none" onChange={e => setLoginData({...loginData, user: e.target.value})} />
            <input type="password" placeholder="Contraseña" className="w-full p-4 border rounded-xl outline-none" onChange={e => setLoginData({...loginData, pass: e.target.value})} />
            <button className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold">ENTRAR</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex text-slate-900">
      {/* SIDEBAR */}
      <aside className="w-64 bg-[#1E293B] text-slate-300 flex flex-col fixed h-full z-20">
        <div className="p-8 font-black text-white text-xl border-b border-slate-800">SIGERED</div>
        <nav className="flex-1 p-4 space-y-2">
          <button onClick={() => setView('dashboard')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl ${view === 'dashboard' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800'}`}><LayoutDashboard size={18}/> Dashboard</button>
          <button onClick={() => setView('list')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl ${view === 'list' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800'}`}><FileText size={18}/> Gestión</button>
          <button onClick={() => setView('reports')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl ${view === 'reports' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800'}`}><Download size={18}/> Reportes</button>
        </nav>
        <div className="p-6 border-t border-slate-800 flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-white text-xs">{session.user[0]}</div>
          <span className="text-xs font-bold flex-1">{session.user}</span>
          <button onClick={() => setSession(null)}><LogOut size={16}/></button>
        </div>
      </aside>

      <main className="ml-64 flex-1 flex flex-col h-screen overflow-hidden">
        {/* BARRA DE FILTROS GLOBALES */}
        <header className="bg-white border-b p-4 flex flex-wrap items-center gap-3 sticky top-0 z-10 shadow-sm">
          <div className="flex gap-2 mr-auto">
            <button onClick={() => setIsNewModalOpen(true)} className="bg-blue-600 text-white px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2"><Plus size={14}/> Nuevo</button>
            <label className="bg-slate-100 border px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2 cursor-pointer"><Upload size={14}/> Importar <input type="file" className="hidden" onChange={handleImport}/></label>
          </div>

          {/* FILTROS DINÁMICOS */}
          <div className="flex flex-wrap gap-2">
            <div className="relative"><Search size={14} className="absolute left-3 top-2.5 text-slate-400"/><input type="text" placeholder="Buscar CUT..." className="pl-9 pr-3 py-2 border rounded-lg text-xs outline-none w-32" onChange={e => setFilters({...filters, search: e.target.value})}/></div>
            
            <select className="border rounded-lg p-2 text-[10px] font-bold" onChange={e => setFilters({...filters, sede: e.target.value})}>
                <option value="">Sedes (Todas)</option>
                <option value="SC">SC (Central)</option>
                <option value="OD (Órgano Descon.)">OD (Órgano Descon.)</option>
            </select>

            <select className="border rounded-lg p-2 text-[10px] font-bold" onChange={e => setFilters({...filters, estado: e.target.value})}>
                <option value="">Estado (Todos)</option>
                <option value="PENDIENTE">PENDIENTE</option>
                <option value="RECUPERADO">RECUPERADO</option>
                <option value="RECONSTRUCCION">RECONSTRUCCION</option>
            </select>

            <select className="border rounded-lg p-2 text-[10px] font-bold" onChange={e => setFilters({...filters, etapa: e.target.value})}>
                <option value="">Etapa (Todas)</option>
                <option value="VERIFICACION">1. Verificación</option>
                <option value="REQUERIMIENTO">2. Requerimiento</option>
                <option value="SEGUIMIENTO">3. Seguimiento</option>
                <option value="CIERRE">4. Cierre</option>
            </select>

            <select className="border rounded-lg p-2 text-[10px] font-bold" onChange={e => setFilters({...filters, origen: e.target.value})}>
                <option value="">Origen (Todos)</option>
                <option value="Interno">Interno</option>
                <option value="Externo">Externo</option>
            </select>
          </div>
        </header>

        <div className="p-8 overflow-y-auto flex-1">
          {view === 'dashboard' ? (
            <div className="space-y-8">
              <div className="grid grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-2xl border shadow-sm">
                  <p className="text-[10px] font-black text-slate-400 uppercase">Sistema Total</p>
                  <h3 className="text-3xl font-black">{totalDocs}</h3>
                </div>
                <div className="bg-white p-6 rounded-2xl border shadow-sm border-l-4 border-l-red-500">
                  <p className="text-[10px] font-black text-slate-400 uppercase">Pendientes</p>
                  <h3 className="text-3xl font-black text-red-600">{docs.filter(d => d.estado_final === 'PENDIENTE').length}</h3>
                </div>
                <div className="bg-white p-6 rounded-2xl border shadow-sm border-l-4 border-l-orange-500">
                  <p className="text-[10px] font-black text-slate-400 uppercase">En Proceso</p>
                  <h3 className="text-3xl font-black text-orange-500">{docs.filter(d => d.etapa_actual !== 'VERIFICACION' && d.estado_final === 'PENDIENTE').length}</h3>
                </div>
                <div className="bg-white p-6 rounded-2xl border shadow-sm border-l-4 border-l-green-500">
                  <p className="text-[10px] font-black text-slate-400 uppercase">Recuperados</p>
                  <h3 className="text-3xl font-black text-green-600">{docs.filter(d => d.estado_final === 'RECUPERADO').length}</h3>
                </div>
              </div>
              
              <div className="bg-white p-8 rounded-3xl border shadow-sm">
                <h4 className="font-bold mb-6 text-slate-500">Avance de Usuarios (En base a filtros actuales)</h4>
                <div className="grid grid-cols-3 gap-4">
                  {USUARIOS.map(u => {
                    const count = docs.filter(d => d.responsable_verificacion === u.user).length;
                    const done = docs.filter(d => d.responsable_verificacion === u.user && d.estado_final === 'RECUPERADO').length;
                    return (
                      <div key={u.user} className="p-4 border rounded-xl bg-slate-50">
                        <p className="font-bold text-sm">{u.user}</p>
                        <div className="flex justify-between text-xs mt-2">
                          <span>Asignados: {count}</span>
                          <span className="text-green-600">Recuperados: {done}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          ) : view === 'list' ? (
            <div className="space-y-4">
              {/* ACCIONES MASIVAS BARRA */}
              {selectedIds.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl flex items-center justify-between animate-in fade-in slide-in-from-top-2">
                  <span className="text-blue-700 font-bold text-sm">{selectedIds.length} documentos seleccionados</span>
                  <div className="flex gap-3">
                    <select className="text-xs p-2 border rounded bg-white" onChange={(e) => handleBulkAssign(e.target.value)}>
                      <option value="">Asignar a...</option>
                      {USUARIOS.map(u => <option key={u.user} value={u.user}>{u.user}</option>)}
                    </select>
                    <button onClick={handleBulkDelete} className="bg-red-100 text-red-600 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2"><Trash2 size={14}/> Eliminar</button>
                  </div>
                </div>
              )}

              <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b text-[10px] font-black text-slate-400 uppercase">
                    <tr>
                      <th className="p-4 pl-6 w-10">
                        <button onClick={toggleSelectAll}>{selectedIds.length === docs.length ? <CheckSquare size={18} className="text-blue-600"/> : <Square size={18}/>}</button>
                      </th>
                      <th className="p-4">CUT</th>
                      <th className="p-4">Documento</th>
                      <th className="p-4">Sede</th>
                      <th className="p-4">Origen</th>
                      <th className="p-4 text-center">Etapa / Estado</th>
                      <th className="p-4 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-sm">
                    {docs.map(doc => {
                      const status = getStatusStyles(doc);
                      return (
                        <tr key={doc.id} className={`hover:bg-slate-50 ${selectedIds.includes(doc.id) ? 'bg-blue-50/30' : ''}`}>
                          <td className="p-4 pl-6">
                            <button onClick={() => toggleSelectDoc(doc.id)}>{selectedIds.includes(doc.id) ? <CheckSquare size={18} className="text-blue-600"/> : <Square size={18} className="text-slate-300"/>}</button>
                          </td>
                          <td className="p-4 font-bold">{doc.cut}</td>
                          <td className="p-4 text-xs text-slate-500 truncate max-w-[200px]">{doc.documento}</td>
                          <td className="p-4 text-xs font-bold text-slate-600">{doc.sede}</td>
                          <td className="p-4 text-[10px] font-bold text-slate-400 uppercase">{doc.origen}</td>
                          <td className="p-4">
                             <div className="flex flex-col items-center gap-1">
                                <span className="text-[9px] font-black bg-slate-200 px-2 py-0.5 rounded">{doc.etapa_actual}</span>
                                <span className={`text-[10px] font-black px-3 py-1 rounded-full border ${status.bg}`}>{status.label}</span>
                             </div>
                          </td>
                          <td className="p-4 text-center">
                            <button onClick={() => setEditingDoc(doc)} className="text-blue-600 font-bold text-xs hover:underline">DETALLES</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <div className="p-6 bg-slate-50 flex justify-between items-center">
                  <p className="text-xs font-bold text-slate-400">Total: {totalDocs} registros</p>
                  <div className="flex gap-2">
                    <button onClick={() => setPage(p => p - 1)} disabled={page === 1} className="p-2 border rounded-lg bg-white disabled:opacity-30"><ChevronLeft size={18}/></button>
                    <button onClick={() => setPage(p => p + 1)} disabled={page * 100 >= totalDocs} className="p-2 border rounded-lg bg-white disabled:opacity-30"><ChevronRight size={18}/></button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* MÓDULO DE REPORTES */
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="bg-white p-10 rounded-[30px] border shadow-sm text-center space-y-6">
                <div className="bg-blue-100 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto text-blue-600"><Download size={32}/></div>
                <h2 className="text-2xl font-black">Módulo de Reportes Excel</h2>
                <p className="text-slate-500 text-sm italic">Exporte la información procesada para auditorías o revisiones externas.</p>
                <div className="grid grid-cols-2 gap-4 pt-4">
                  <button onClick={() => handleExport(false)} className="bg-white border-2 border-blue-600 text-blue-600 p-4 rounded-2xl font-bold hover:bg-blue-50 transition-all flex flex-col items-center gap-2">
                    <Filter size={20}/>
                    <span>Reporte Filtrado</span>
                    <span className="text-[10px] opacity-60 font-normal">(Basado en filtros actuales)</span>
                  </button>
                  <button onClick={() => handleExport(true)} className="bg-blue-600 text-white p-4 rounded-2xl font-bold hover:bg-blue-700 transition-all flex flex-col items-center gap-2 shadow-lg shadow-blue-200">
                    <RefreshCcw size={20}/>
                    <span>Reporte General</span>
                    <span className="text-[10px] opacity-80 font-normal">(Toda la base de datos)</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* MODAL NUEVO REGISTRO */}
      {isNewModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100]">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden">
            <div className="p-6 bg-slate-900 text-white flex justify-between">
              <h3 className="font-bold">Nuevo Registro</h3>
              <button onClick={() => setIsNewModalOpen(false)}><X/></button>
            </div>
            <div className="p-8 space-y-4">
              <input type="text" placeholder="CUT" className="w-full p-4 border rounded-xl" id="n_cut" />
              <input type="text" placeholder="Documento" className="w-full p-4 border rounded-xl" id="n_doc" />
              <select className="w-full p-4 border rounded-xl font-bold" id="n_sede">
                <option value="SC">SEDE CENTRAL (SC)</option>
                <option value="OD (Órgano Descon.)">OD (Órgano Descon.)</option>
              </select>
              <select className="w-full p-4 border rounded-xl font-bold" id="n_origen">
                <option value="Externo">Externo</option>
                <option value="Interno">Interno</option>
              </select>
              <button onClick={async () => {
                const doc = { 
                  cut: document.getElementById('n_cut').value, 
                  documento: document.getElementById('n_doc').value,
                  sede: document.getElementById('n_sede').value,
                  origen: document.getElementById('n_origen').value,
                  etapa_actual: 'VERIFICACION', estado_final: 'PENDIENTE',
                  fecha_registro: new Date().toISOString().split('T')[0]
                };
                const { error } = await supabase.from('documentos').insert([doc]);
                if (!error) { setIsNewModalOpen(false); fetchDocs(); } else alert("Error (CUT duplicado)");
              }} className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold">REGISTRAR</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EDICIÓN */}
      {editingDoc && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-6">
          <div className="bg-white rounded-[40px] w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden">
            <div className="p-8 bg-slate-900 text-white flex justify-between">
              <div>
                <h3 className="text-xl font-bold">Expediente: {editingDoc.cut}</h3>
                <p className="text-xs text-blue-400 uppercase font-bold">{editingDoc.documento}</p>
              </div>
              <button onClick={() => setEditingDoc(null)}><X/></button>
            </div>
            <div className="flex-1 p-10 overflow-y-auto grid grid-cols-2 gap-8">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Responsable Asignado</label>
                <select className="w-full p-4 border rounded-2xl font-bold bg-slate-50" value={editingDoc.responsable_verificacion || ''} onChange={e => setEditingDoc({...editingDoc, responsable_verificacion: e.target.value})}>
                  <option value="">Sin Asignar</option>
                  {USUARIOS.map(u => <option key={u.user} value={u.user}>{u.user}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Estado Final</label>
                <select className="w-full p-4 border rounded-2xl font-bold bg-slate-50" value={editingDoc.estado_final} onChange={e => setEditingDoc({...editingDoc, estado_final: e.target.value})}>
                  <option value="PENDIENTE">PENDIENTE</option>
                  <option value="RECUPERADO">RECUPERADO</option>
                  <option value="RECONSTRUCCION">RECONSTRUCCION</option>
                </select>
              </div>
              <div className="col-span-2 space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Observaciones</label>
                <textarea className="w-full p-4 border rounded-2xl bg-slate-50" rows="3" value={editingDoc.observaciones || ''} onChange={e => setEditingDoc({...editingDoc, observaciones: e.target.value})}></textarea>
              </div>
            </div>
            <div className="p-8 bg-slate-50 border-t flex justify-end gap-4">
              <button onClick={async () => {
                const { error } = await supabase.from('documentos').update(editingDoc).eq('id', editingDoc.id);
                if (!error) { setEditingDoc(null); fetchDocs(); }
              }} className="bg-blue-600 text-white px-12 py-4 rounded-2xl font-bold shadow-lg shadow-blue-200 uppercase text-xs tracking-widest">Guardar Cambios</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
