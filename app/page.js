'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './lib/supabase';
import * as XLSX from 'xlsx';
import { 
  LayoutDashboard, FileText, Upload, Download, Search, 
  LogOut, ChevronLeft, ChevronRight, Save, Plus, Clock, 
  CheckCircle2, AlertCircle, Trash2, Filter, X, CheckSquare, Square, Calendar, Phone, BookOpen, MessageSquare
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
  const [selectedIds, setSelectedIds] = useState([]);
  const [seguimientos, setSeguimientos] = useState([]);
  const [activeTab, setActiveTab] = useState(1);
  const [filters, setFilters] = useState({ 
    search: '', sede: '', etapa: '', estado: '', origen: '', responsable: '', fechaDesde: '', fechaHasta: '' 
  });

  const ITEMS_PER_PAGE = 100;

  // --- REGLAS DE ETAPA / ESTADO ---
  const getEtapaEstado = (doc) => {
    if (doc.cargado_sisged) return { etapa: '4°CIERRE', estado: 'RECUPERADO', color: 'bg-green-100 text-green-700 border-green-200' };

    if (!doc.estado_visualizacion || doc.estado_visualizacion === 'PENDIENTE') {
      return { etapa: '1°VERIFICACION', estado: 'PENDIENTE', color: 'bg-red-100 text-red-700 border-red-200' };
    }

    if (doc.estado_visualizacion === 'SI SE VISUALIZA') {
      return { etapa: '4°CIERRE', estado: 'RECUPERADO', color: 'bg-green-100 text-green-700 border-green-200' };
    }

    if (doc.estado_visualizacion === 'NO SE VISUALIZA') {
      if (doc.origen === 'Interno') {
        return { etapa: '4°CIERRE', estado: 'PENDIENTE', color: 'bg-red-100 text-red-700 border-red-200' };
      } else {
        if (!doc.numero_documento) return { etapa: '2°REQUERIMIENTO', estado: 'PENDIENTE', color: 'bg-red-100 text-red-700 border-red-200' };
        if (doc.ultimo_seguimiento) return { etapa: '3°SEGUIMIENTO', estado: 'EN PROCESO', color: 'bg-orange-100 text-orange-700 border-orange-200' };
        return { etapa: '3°SEGUIMIENTO', estado: 'PENDIENTE', color: 'bg-red-100 text-red-700 border-red-200' };
      }
    }
    return { etapa: '1°VERIFICACION', estado: 'PENDIENTE', color: 'bg-red-100 text-red-700 border-red-200' };
  };

  const handleLogin = (e) => {
    e.preventDefault();
    const valid = USUARIOS.find(u => u.user === loginData.user && u.pass === loginData.pass);
    if (valid) setSession(valid); else alert('Credenciales incorrectas');
  };

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    let from = (page - 1) * ITEMS_PER_PAGE;
    let to = from + ITEMS_PER_PAGE - 1;
    let query = supabase.from('documentos').select('*', { count: 'exact' });

    if (filters.search) query = query.or(`cut.ilike.%${filters.search}%,documento.ilike.%${filters.search}%`);
    if (filters.sede) query = query.eq('sede', filters.sede);
    if (filters.origen) query = query.eq('origen', filters.origen);

    const { data, count, error } = await query.order('creado_at', { ascending: false }).range(from, to);
    if (!error) { setDocs(data); setTotalDocs(count); }
    setLoading(false);
  }, [page, filters]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  useEffect(() => {
    if (editingDoc) {
      supabase.from('seguimientos').select('*').eq('documento_id', editingDoc.id).order('creado_at', { ascending: false })
        .then(({ data }) => setSeguimientos(data || []));
    }
  }, [editingDoc]);

  const handleImport = (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const data = XLSX.utils.sheet_to_json(XLSX.read(evt.target.result, { type: 'binary' }).Sheets[XLSX.read(evt.target.result, { type: 'binary' }).SheetNames[0]], { header: 1 });
      const batch = data.slice(1).map(row => ({
        sede: row[0], cut: String(row[1] || ''), documento: String(row[2] || ''), remitente: row[3],
        fecha_registro: row[4], origen: row[5], procedimiento: row[6], celular: String(row[7] || ''),
        responsable_verificacion: row[8], fecha_verificacion: row[9], estado_visualizacion: row[11],
        responsable_requerimiento: row[13], fecha_elaboracion: row[14], numero_documento: String(row[15] || ''),
        cargado_sisged: String(row[27]).toUpperCase() === 'SI', estado_final: row[28], creado_at: new Date().toISOString()
      })).filter(d => d.cut);
      await supabase.from('documentos').upsert(batch, { onConflict: 'cut,documento' });
      fetchDocs();
    };
    reader.readAsBinaryString(file);
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden">
          <div className="bg-blue-600 p-12 text-center text-white">
            <h1 className="text-4xl font-black">SIGERED</h1>
            <p className="text-[10px] uppercase mt-2 tracking-[0.2em] opacity-70">Sistema de Recuperación</p>
          </div>
          <form onSubmit={handleLogin} className="p-10 space-y-5">
            <input type="text" placeholder="Usuario" className="w-full p-4 bg-slate-50 border rounded-2xl outline-none" onChange={e => setLoginData({...loginData, user: e.target.value})} required />
            <input type="password" placeholder="Contraseña" className="w-full p-4 bg-slate-50 border rounded-2xl outline-none" onChange={e => setLoginData({...loginData, pass: e.target.value})} required />
            <button type="submit" className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold">INICIAR SESIÓN</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex text-slate-900 font-sans">
      <aside className="w-64 bg-[#1E293B] text-slate-400 flex flex-col fixed h-full z-20">
        <div className="p-8 font-black text-white text-2xl border-b border-slate-800 tracking-tighter">SIGERED</div>
        <nav className="flex-1 p-4 space-y-2 mt-4">
          <button onClick={() => setView('dashboard')} className={`w-full flex items-center gap-3 px-5 py-3.5 rounded-2xl transition-all ${view === 'dashboard' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800'}`}><LayoutDashboard size={18}/> Dashboard</button>
          <button onClick={() => setView('list')} className={`w-full flex items-center gap-3 px-5 py-3.5 rounded-2xl transition-all ${view === 'list' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800'}`}><FileText size={18}/> Gestión</button>
          <button onClick={() => setView('reports')} className={`w-full flex items-center gap-3 px-5 py-3.5 rounded-2xl transition-all ${view === 'reports' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800'}`}><Download size={18}/> Reportes</button>
        </nav>
        <div className="p-6 border-t border-slate-800 flex items-center gap-3 bg-slate-900/50">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center font-bold text-white text-sm">
            {session?.user ? session.user[0] : 'U'}
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-xs font-bold text-white truncate">{session?.user || 'Usuario'}</p>
          </div>
          <button onClick={() => setSession(null)} className="hover:text-white transition-colors"><LogOut size={18}/></button>
        </div>
      </aside>

      <main className="ml-64 flex-1 flex flex-col h-screen overflow-hidden">
        <header className="bg-white border-b p-4 flex flex-wrap items-center gap-4 sticky top-0 z-10 px-8 shadow-sm">
          <button onClick={() => setIsNewModalOpen(true)} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2"><Plus size={14}/> Nuevo</button>
          <label className="bg-white border px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer hover:bg-slate-50"><Upload size={14}/> Importar <input type="file" className="hidden" onChange={handleImport}/></label>
          <div className="flex flex-wrap gap-2 ml-auto">
            <select className="border rounded-xl p-2 text-[10px] font-black uppercase" onChange={e => setFilters({...filters, sede: e.target.value})}>
              <option value="">Sedes</option><option value="SC">SC</option><option value="OD">OD</option>
            </select>
            <select className="border rounded-xl p-2 text-[10px] font-black uppercase" onChange={e => setFilters({...filters, origen: e.target.value})}>
              <option value="">Origen</option><option value="Interno">Interno</option><option value="Externo">Externo</option>
            </select>
          </div>
        </header>

        <div className="p-10 overflow-y-auto flex-1">
          {view === 'dashboard' ? (
            <div className="space-y-10">
              <div className="grid grid-cols-4 gap-8">
                <div className="bg-white p-8 rounded-[32px] border shadow-sm border-b-4 border-b-blue-500">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total</p>
                  <h3 className="text-4xl font-black">{totalDocs}</h3>
                </div>
                <div className="bg-white p-8 rounded-[32px] border shadow-sm border-b-4 border-b-red-500">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Pendientes</p>
                  <h3 className="text-4xl font-black text-red-600">{docs.filter(d => getEtapaEstado(d).estado === 'PENDIENTE').length}</h3>
                </div>
                <div className="bg-white p-8 rounded-[32px] border shadow-sm border-b-4 border-b-orange-500">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">En Seguimiento</p>
                  <h3 className="text-4xl font-black text-orange-500">{docs.filter(d => getEtapaEstado(d).estado === 'EN PROCESO').length}</h3>
                </div>
                <div className="bg-white p-8 rounded-[32px] border shadow-sm border-b-4 border-b-green-500">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Recuperados</p>
                  <h3 className="text-4xl font-black text-green-600">{docs.filter(d => getEtapaEstado(d).estado === 'RECUPERADO').length}</h3>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-[40px] shadow-sm border overflow-hidden">
               <table className="w-full text-left">
                <thead className="bg-slate-50 border-b text-[10px] font-black text-slate-400 uppercase">
                  <tr>
                    <th className="p-5 pl-10">CUT / Documento</th>
                    <th className="p-5 text-center">Etapa / Estado</th>
                    <th className="p-5 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y text-sm">
                  {docs.map(doc => {
                    const status = getEtapaEstado(doc);
                    return (
                      <tr key={doc.id} className="hover:bg-slate-50">
                        <td className="p-5 pl-10"><p className="font-black">{doc.cut}</p><p className="text-[10px] font-bold text-slate-400">{doc.documento}</p></td>
                        <td className="p-5">
                           <div className="flex flex-col items-center gap-1">
                              <span className="text-[9px] font-black bg-slate-200 text-slate-500 px-2 py-0.5 rounded uppercase">{status.etapa}</span>
                              <span className={`text-[10px] font-black px-4 py-1.5 rounded-xl border shadow-sm uppercase ${status.color}`}>{status.estado}</span>
                           </div>
                        </td>
                        <td className="p-5 text-center"><button onClick={() => setEditingDoc(doc)} className="bg-white border-2 border-blue-50 text-blue-600 font-black text-[10px] px-4 py-2 rounded-xl">Detalles</button></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {editingDoc && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[100] p-10">
          <div className="bg-white rounded-[40px] w-full max-w-6xl h-[85vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-8 bg-slate-900 text-white flex justify-between items-center">
              <div><h3 className="text-xl font-black tracking-tight">{editingDoc.cut} • {editingDoc.documento}</h3></div>
              <button onClick={() => setEditingDoc(null)}>✕</button>
            </div>
            <div className="flex flex-1 overflow-hidden">
              <div className="w-72 bg-slate-50 border-r p-8 space-y-3">
                <button onClick={() => setActiveTab(1)} className={`w-full text-left p-5 rounded-[24px] font-black text-xs ${activeTab === 1 ? 'bg-white border-2 border-blue-600 text-blue-700' : 'text-slate-400'}`}>1. VERIFICACIÓN</button>
                {editingDoc.origen === 'Externo' && (
                  <>
                    <button onClick={() => setActiveTab(2)} className={`w-full text-left p-5 rounded-[24px] font-black text-xs ${activeTab === 2 ? 'bg-white border-2 border-blue-600 text-blue-700' : 'text-slate-400'}`}>2. REQUERIMIENTO</button>
                    <button onClick={() => setActiveTab(3)} className={`w-full text-left p-5 rounded-[24px] font-black text-xs ${activeTab === 3 ? 'bg-white border-2 border-blue-600 text-blue-700' : 'text-slate-400'}`}>3. SEGUIMIENTO</button>
                  </>
                )}
                <button onClick={() => setActiveTab(4)} className={`w-full text-left p-5 rounded-[24px] font-black text-xs ${activeTab === 4 ? 'bg-white border-2 border-blue-600 text-blue-700' : 'text-slate-400'}`}>4. CIERRE</button>
              </div>
              <div className="flex-1 p-12 overflow-y-auto bg-white">
                {activeTab === 1 && (
                  <div className="grid grid-cols-2 gap-8">
                    <select className="w-full p-5 bg-slate-50 border rounded-2xl font-bold" value={editingDoc.responsable_verificacion || ''} onChange={e => setEditingDoc({...editingDoc, responsable_verificacion: e.target.value})}><option value="">Responsable...</option>{USUARIOS.map(u => <option key={u.user} value={u.user}>{u.user}</option>)}</select>
                    <input type="date" className="w-full p-5 bg-slate-50 border rounded-2xl font-bold" value={editingDoc.fecha_verificacion || ''} onChange={e => setEditingDoc({...editingDoc, fecha_verificacion: e.target.value})}/>
                    <div className="col-span-2 grid grid-cols-2 gap-6">
                      <button onClick={() => setEditingDoc({...editingDoc, estado_visualizacion: 'SI SE VISUALIZA'})} className={`p-6 rounded-3xl border-2 font-black ${editingDoc.estado_visualizacion === 'SI SE VISUALIZA' ? 'border-green-500 bg-green-50 text-green-700' : 'border-slate-100'}`}>SÍ SE VISUALIZA</button>
                      <button onClick={() => setEditingDoc({...editingDoc, estado_visualizacion: 'NO SE VISUALIZA'})} className={`p-6 rounded-3xl border-2 font-black ${editingDoc.estado_visualizacion === 'NO SE VISUALIZA' ? 'border-red-500 bg-red-50 text-red-700' : 'border-slate-100'}`}>NO SE VISUALIZA</button>
                    </div>
                  </div>
                )}
                {activeTab === 3 && (
                   <div className="space-y-6">
                     <textarea id="s_obs" className="w-full p-4 border rounded-xl" placeholder="Anotar seguimiento..."></textarea>
                     <button onClick={async () => {
                       const obs = document.getElementById('s_obs').value;
                       if(!obs) return;
                       await supabase.from('seguimientos').insert([{ documento_id: editingDoc.id, responsable: session?.user, observaciones: obs }]);
                       await supabase.from('documentos').update({ ultimo_seguimiento: new Date().toISOString() }).eq('id', editingDoc.id);
                       alert("Agregado"); fetchDocs();
                     }} className="bg-blue-600 text-white p-4 rounded-xl font-bold">Grabar Seguimiento</button>
                   </div>
                )}
                {activeTab === 4 && (
                  <div className="space-y-6">
                    <div className="flex items-center gap-4 bg-emerald-50 p-6 rounded-3xl border border-emerald-100">
                      <input type="checkbox" className="w-8 h-8" checked={editingDoc.cargado_sisged} onChange={e => setEditingDoc({...editingDoc, cargado_sisged: e.target.checked})}/>
                      <label className="font-black text-emerald-900 uppercase text-xs">¿Se cargó al SISGED? (Marca SI)</label>
                    </div>
                    <select className="w-full p-5 bg-slate-50 border rounded-2xl font-bold" value={editingDoc.estado_final || 'PENDIENTE'} onChange={e => setEditingDoc({...editingDoc, estado_final: e.target.value})}><option value="PENDIENTE">PENDIENTE</option><option value="RECUPERADO">RECUPERADO</option><option value="RECONSTRUCCION">RECONSTRUCCION</option></select>
                  </div>
                )}
              </div>
            </div>
            <div className="p-8 bg-slate-50 border-t flex justify-end gap-4 shrink-0">
              <button onClick={async () => {
                await supabase.from('documentos').update(editingDoc).eq('id', editingDoc.id);
                alert("Guardado"); setEditingDoc(null); fetchDocs();
              }} className="bg-blue-600 text-white px-12 py-5 rounded-[24px] font-black text-xs uppercase shadow-2xl">Guardar Cambios</button>
            </div>
          </div>
        </div>
      )}

      {isNewModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-[110] p-6">
          <div className="bg-white rounded-[40px] w-full max-w-xl p-10 space-y-6">
            <h3 className="text-xl font-black uppercase text-center">Nuevo Registro</h3>
            <div className="grid grid-cols-2 gap-4">
              <input type="text" placeholder="CUT" className="w-full p-4 border rounded-2xl" id="n_cut" />
              <input type="text" placeholder="Documento" className="w-full p-4 border rounded-2xl" id="n_doc" />
              <select className="w-full p-4 border rounded-2xl" id="n_ori"><option value="Externo">Externo</option><option value="Interno">Interno</option></select>
            </div>
            <button onClick={async () => {
              const doc = { cut: document.getElementById('n_cut').value, documento: document.getElementById('n_doc').value, origen: document.getElementById('n_ori').value, etapa_actual: '1°VERIFICACION', estado_final: 'PENDIENTE', creado_at: new Date().toISOString() };
              await supabase.from('documentos').insert([doc]);
              setIsNewModalOpen(false); fetchDocs();
            }} className="w-full bg-blue-600 text-white py-4 rounded-[20px] font-black uppercase">Registrar</button>
          </div>
        </div>
      )}
    </div>
  );
}
