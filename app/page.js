'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './lib/supabase';
import * as XLSX from 'xlsx';
import { 
  LayoutDashboard, FileText, Upload, Download, Search, 
  LogOut, ChevronLeft, ChevronRight, Save, Plus, Clock, 
  CheckCircle2, AlertCircle, Trash2, Filter, RefreshCcw, X, CheckSquare, Square, Calendar, Phone, BookOpen, MessageSquare
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
  const [activeTab, setActiveTab] = useState(1);
  const [seguimientos, setSeguimientos] = useState([]);
  const [filters, setFilters] = useState({ 
    search: '', sede: '', etapa: '', estado: '', origen: '', responsable: '', fechaDesde: '', fechaHasta: '' 
  });

  const ITEMS_PER_PAGE = 100;

  // --- CÁLCULO DE DÍAS HÁBILES ---
  const calcularDiasHabiles = (fechaRef) => {
    if (!fechaRef) return 0;
    let fechaInicio = new Date(fechaRef);
    let fechaFin = new Date();
    let count = 0;
    while (fechaInicio <= fechaFin) {
      let day = fechaInicio.getDay();
      if (day !== 0 && day !== 6) count++;
      fechaInicio.setDate(fechaInicio.getDate() + 1);
    }
    return count;
  };

  // --- LÓGICA DE ETAPA / ESTADO (REGLAS EXACTAS) ---
  const getEtapaEstado = (doc) => {
    // REGLA 3° SEGUIMIENTO -> SISGED
    if (doc.cargado_sisged) return { etapa: '4°CIERRE', estado: 'RECUPERADO', color: 'bg-green-100 text-green-700 border-green-200' };

    // REGLA 1° VERIFICACION -> SI SE VISUALIZA
    if (doc.estado_visualizacion === 'SI SE VISUALIZA') return { etapa: '4°CIERRE', estado: 'RECUPERADO', color: 'bg-green-100 text-green-700 border-green-200' };

    // REGLA 1° VERIFICACION -> NO SE VISUALIZA
    if (doc.estado_visualizacion === 'NO SE VISUALIZA') {
      if (doc.origen === 'Interno') return { etapa: '4°CIERRE', estado: 'PENDIENTE', color: 'bg-red-100 text-red-700 border-red-200' };
      
      // EXTERNO: REQUERIMIENTO
      if (!doc.numero_documento) return { etapa: '2°REQUERIMIENTO', estado: 'PENDIENTE', color: 'bg-red-100 text-red-700 border-red-200' };
      
      // EXTERNO: SEGUIMIENTO
      if (doc.ultimo_seguimiento) return { etapa: '3°SEGUIMIENTO', estado: 'EN PROCESO', color: 'bg-orange-100 text-orange-700 border-orange-200' };
      return { etapa: '3°SEGUIMIENTO', estado: 'PENDIENTE', color: 'bg-red-100 text-red-700 border-red-200' };
    }

    // POR DEFECTO: VERIFICACION PENDIENTE
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
    if (filters.estado) query = query.eq('estado_final', filters.estado);
    if (filters.origen) query = query.eq('origen', filters.origen);

    const { data, count, error } = await query.order('creado_at', { ascending: false }).range(from, to);
    if (!error) { setDocs(data); setTotalDocs(count); }
    setLoading(false);
  }, [page, filters]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  // Cargar seguimientos al abrir modal
  useEffect(() => {
    if (editingDoc) {
      supabase.from('seguimientos').select('*').eq('documento_id', editingDoc.id).order('fecha', { ascending: false })
        .then(({ data }) => setSeguimientos(data || []));
    }
  }, [editingDoc]);

  const formatExcelDate = (val) => {
    if (!val) return null;
    if (typeof val === 'number') {
      const date = new Date((val - (25567 + 1)) * 86400 * 1000);
      return date.toISOString().split('T')[0];
    }
    return val;
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const data = XLSX.utils.sheet_to_json(XLSX.read(evt.target.result, { type: 'binary' }).Sheets[XLSX.read(evt.target.result, { type: 'binary' }).SheetNames[0]], { header: 1 });
      const batch = data.slice(1).map(row => ({
        sede: row[0], cut: String(row[1] || ''), documento: String(row[2] || ''), remitente: row[3],
        fecha_registro: formatExcelDate(row[4]), origen: row[5], procedimiento: row[6], celular: String(row[7] || ''),
        responsable_verificacion: row[8], fecha_verificacion: formatExcelDate(row[9]), estado_visualizacion: row[11], observaciones: row[12],
        responsable_requerimiento: row[13], fecha_elaboracion: formatExcelDate(row[14]), numero_documento: String(row[15] || ''),
        fecha_notificacion: formatExcelDate(row[16]), medio_notificacion: row[17], fecha_remision: formatExcelDate(row[22]),
        responsable_devolucion: row[23], fecha_devolucion: formatExcelDate(row[24]), documento_cierre: String(row[25] || ''),
        oficina_destino: row[26], cargado_sisged: String(row[27]).toUpperCase() === 'SI',
        estado_final: row[28] || 'PENDIENTE', observaciones_finales: row[29], creado_at: new Date().toISOString()
      })).filter(d => d.cut && d.documento);
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
      {/* SIDEBAR */}
      <aside className="w-64 bg-[#1E293B] text-slate-400 flex flex-col fixed h-full z-20 shadow-2xl">
        <div className="p-8 font-black text-white text-2xl tracking-tighter border-b border-slate-800">SIGERED</div>
        <nav className="flex-1 p-4 space-y-2 mt-4">
          <button onClick={() => setView('dashboard')} className={`w-full flex items-center gap-3 px-5 py-3.5 rounded-2xl transition-all ${view === 'dashboard' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800'}`}><LayoutDashboard size={18}/> Dashboard</button>
          <button onClick={() => setView('list')} className={`w-full flex items-center gap-3 px-5 py-3.5 rounded-2xl transition-all ${view === 'list' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800'}`}><FileText size={18}/> Gestión</button>
          <button onClick={() => setView('reports')} className={`w-full flex items-center gap-3 px-5 py-3.5 rounded-2xl transition-all ${view === 'reports' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800'}`}><Download size={18}/> Reportes</button>
        </nav>
        <div className="p-6 border-t border-slate-800 flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center font-bold text-white text-sm">{session?.user?.[0]}</div>
          <p className="text-xs font-bold text-white truncate flex-1">{session?.user}</p>
          <button onClick={() => setSession(null)}><LogOut size={18}/></button>
        </div>
      </aside>

      <main className="ml-64 flex-1 flex flex-col h-screen overflow-hidden">
        {/* HEADER */}
        <header className="bg-white border-b p-4 flex flex-wrap items-center gap-4 sticky top-0 z-10 px-8 shadow-sm">
          <div className="flex gap-2 mr-auto">
            <button onClick={() => setIsNewModalOpen(true)} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-blue-700 shadow-sm"><Plus size={14}/> Nuevo</button>
            <label className="bg-white border px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer hover:bg-slate-50">
              <Upload size={14}/> Importar Excel <input type="file" className="hidden" accept=".xlsx, .xls" onChange={handleImport}/>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="relative"><Search size={14} className="absolute left-3 top-2.5 text-slate-400"/><input type="text" placeholder="CUT / Doc..." className="pl-9 pr-3 py-2 bg-slate-50 border rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 w-40" onChange={e => setFilters({...filters, search: e.target.value})}/></div>
            <select className="border rounded-xl p-2 text-[10px] font-black uppercase" onChange={e => setFilters({...filters, sede: e.target.value})}>
                <option value="">Sedes</option><option value="SC">SC</option><option value="OD">OD</option>
            </select>
          </div>
        </header>

        <div className="p-10 overflow-y-auto flex-1">
          {view === 'dashboard' ? (
            <div className="space-y-10 animate-in fade-in">
              <div className="grid grid-cols-4 gap-8">
                <div className="bg-white p-8 rounded-[32px] border shadow-sm border-b-4 border-b-blue-500"><p className="text-[10px] font-black text-slate-400 uppercase mb-1 tracking-widest">Sistema Total</p><h3 className="text-4xl font-black">{totalDocs}</h3></div>
                <div className="bg-white p-8 rounded-[32px] border shadow-sm border-b-4 border-b-red-500"><p className="text-[10px] font-black text-slate-400 uppercase mb-1 tracking-widest">Pendientes Verif.</p><h3 className="text-4xl font-black text-red-600">{docs.filter(d => getEtapaEstado(d).etapa === '1°VERIFICACION').length}</h3></div>
                <div className="bg-white p-8 rounded-[32px] border shadow-sm border-b-4 border-b-orange-500"><p className="text-[10px] font-black text-slate-400 uppercase mb-1 tracking-widest">En Seguimiento</p><h3 className="text-4xl font-black text-orange-500">{docs.filter(d => getEtapaEstado(d).estado === 'EN PROCESO').length}</h3></div>
                <div className="bg-white p-8 rounded-[32px] border shadow-sm border-b-4 border-b-green-500"><p className="text-[10px] font-black text-slate-400 uppercase mb-1 tracking-widest">Recuperados</p><h3 className="text-4xl font-black text-green-600">{docs.filter(d => getEtapaEstado(d).estado === 'RECUPERADO').length}</h3></div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-[40px] shadow-sm border overflow-hidden">
               <table className="w-full text-left">
                <thead className="bg-slate-50 border-b text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <tr>
                    <th className="p-5 pl-10">CUT / Documento</th>
                    <th className="p-5">Sede</th>
                    <th className="p-5 text-center">Etapa / Estado</th>
                    <th className="p-5 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-sm">
                  {docs.map(doc => {
                    const status = getEtapaEstado(doc);
                    return (
                      <tr key={doc.id} className="hover:bg-slate-50/80 transition-all">
                        <td className="p-5 pl-10">
                          <p className="font-black text-slate-700">{doc.cut}</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase">{doc.documento}</p>
                        </td>
                        <td className="p-5 text-center font-black text-[10px] text-slate-600">{doc.sede}</td>
                        <td className="p-5">
                           <div className="flex flex-col items-center gap-1">
                              <span className="text-[9px] font-black bg-slate-200 text-slate-500 px-2 py-0.5 rounded uppercase">{status.etapa}</span>
                              <span className={`text-[10px] font-black px-4 py-1.5 rounded-xl border uppercase ${status.color}`}>{status.estado}</span>
                           </div>
                        </td>
                        <td className="p-5 text-center">
                          <button onClick={() => { setEditingDoc(doc); setActiveTab(1); }} className="bg-white border text-blue-600 font-black text-[10px] px-4 py-2 rounded-xl shadow-sm hover:bg-blue-50 transition-all">DETALLES</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div className="p-8 bg-slate-50/50 flex justify-between items-center border-t">
                <p className="text-xs font-bold text-slate-400 tracking-widest">Total: {totalDocs} registros</p>
                <div className="flex gap-4">
                  <button onClick={() => setPage(p => p - 1)} disabled={page === 1} className="w-10 h-10 rounded-xl bg-white border flex items-center justify-center hover:bg-blue-600 hover:text-white disabled:opacity-30"><ChevronLeft size={18}/></button>
                  <button onClick={() => setPage(p => p + 1)} disabled={page * 100 >= totalDocs} className="w-10 h-10 rounded-xl bg-white border flex items-center justify-center hover:bg-blue-600 hover:text-white disabled:opacity-30"><ChevronRight size={18}/></button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* --- MODAL DETALLES MULTI-ETAPA --- */}
      {editingDoc && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[100] p-10">
          <div className="bg-white rounded-[40px] w-full max-w-6xl h-[85vh] flex flex-col overflow-hidden shadow-2xl border border-white">
            <div className="p-10 bg-slate-900 text-white flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-2xl font-black tracking-tight">{editingDoc.cut} • {editingDoc.documento}</h3>
                <p className="text-xs text-blue-400 font-bold uppercase tracking-widest mt-1">Origen: {editingDoc.origen}</p>
              </div>
              <button onClick={() => setEditingDoc(null)} className="w-12 h-12 rounded-2xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all">✕</button>
            </div>
            
            <div className="flex flex-1 overflow-hidden">
              {/* TABS LATERALES CONDICIONALES */}
              <div className="w-72 bg-slate-50 border-r p-8 space-y-4 shrink-0">
                <button onClick={() => setActiveTab(1)} className={`w-full text-left p-6 rounded-[24px] font-black text-xs transition-all ${activeTab === 1 ? 'bg-white border-2 border-blue-600 text-blue-700 shadow-xl shadow-blue-900/10' : 'text-slate-400'}`}>1. VERIFICACIÓN</button>
                
                {editingDoc.origen === 'Externo' && (
                  <>
                    <button onClick={() => setActiveTab(2)} className={`w-full text-left p-6 rounded-[24px] font-black text-xs transition-all ${activeTab === 2 ? 'bg-white border-2 border-blue-600 text-blue-700 shadow-xl shadow-blue-900/10' : 'text-slate-400'}`}>2. REQUERIMIENTO</button>
                    <button onClick={() => setActiveTab(3)} className={`w-full text-left p-6 rounded-[24px] font-black text-xs transition-all ${activeTab === 3 ? 'bg-white border-2 border-blue-600 text-blue-700 shadow-xl shadow-blue-900/10' : 'text-slate-400'}`}>3. SEGUIMIENTO ({seguimientos.length})</button>
                  </>
                )}
                
                <button onClick={() => setActiveTab(4)} className={`w-full text-left p-6 rounded-[24px] font-black text-xs transition-all ${activeTab === 4 ? 'bg-white border-2 border-blue-600 text-blue-700 shadow-xl shadow-blue-900/10' : 'text-slate-400'}`}>4. CIERRE</button>
              </div>

              {/* CONTENIDO TABS */}
              <div className="flex-1 p-12 overflow-y-auto bg-white">
                {activeTab === 1 && (
                  <div className="grid grid-cols-2 gap-10 animate-in fade-in">
                    <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Responsable Verificación</label>
                      <select className="w-full p-5 bg-slate-50 border border-slate-100 rounded-3xl font-black text-xs" value={editingDoc.responsable_verificacion || ''} onChange={e => setEditingDoc({...editingDoc, responsable_verificacion: e.target.value})}>
                        <option value="">Seleccione...</option>{USUARIOS.map(u => <option key={u.user} value={u.user}>{u.user}</option>)}
                      </select>
                    </div>
                    <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Fecha de Verificación</label>
                      <input type="date" className="w-full p-5 bg-slate-50 border border-slate-100 rounded-3xl font-black text-xs" value={editingDoc.fecha_verificacion || ''} onChange={e => setEditingDoc({...editingDoc, fecha_verificacion: e.target.value})}/>
                    </div>
                    <div className="col-span-2 space-y-4 pt-4">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Estado de Visualización</label>
                      <div className="grid grid-cols-2 gap-6">
                        <button onClick={() => setEditingDoc({...editingDoc, estado_visualizacion: 'SI SE VISUALIZA'})} className={`p-8 rounded-[32px] border-2 font-black transition-all ${editingDoc.estado_visualizacion === 'SI SE VISUALIZA' ? 'border-green-600 bg-green-50 text-green-700 shadow-lg shadow-green-900/10' : 'border-slate-50 bg-slate-50 text-slate-300'}`}>SI SE VISUALIZA</button>
                        <button onClick={() => setEditingDoc({...editingDoc, estado_visualizacion: 'NO SE VISUALIZA'})} className={`p-8 rounded-[32px] border-2 font-black transition-all ${editingDoc.estado_visualizacion === 'NO SE VISUALIZA' ? 'border-red-600 bg-red-50 text-red-700 shadow-lg shadow-red-900/10' : 'border-slate-50 bg-slate-50 text-slate-300'}`}>NO SE VISUALIZA</button>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 2 && (
                  <div className="grid grid-cols-2 gap-10 animate-in fade-in">
                    <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Responsable Requerimiento</label>
                      <select className="w-full p-5 bg-slate-50 border border-slate-100 rounded-3xl font-black text-xs" value={editingDoc.responsable_requerimiento || ''} onChange={e => setEditingDoc({...editingDoc, responsable_requerimiento: e.target.value})}>
                        <option value="">Seleccione...</option>{USUARIOS.map(u => <option key={u.user} value={u.user}>{u.user}</option>)}
                      </select>
                    </div>
                    <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">N° Documento Generado (Col P)</label>
                      <input type="text" className="w-full p-5 bg-slate-50 border border-slate-100 rounded-3xl font-black text-xs" value={editingDoc.numero_documento || ''} onChange={e => setEditingDoc({...editingDoc, numero_documento: e.target.value})}/>
                    </div>
                    <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Fecha Notificación</label>
                      <input type="date" className="w-full p-5 bg-slate-50 border border-slate-100 rounded-3xl font-black text-xs" value={editingDoc.fecha_notificacion || ''} onChange={e => setEditingDoc({...editingDoc, fecha_notificacion: e.target.value})}/>
                    </div>
                    <div className="bg-blue-50 p-8 rounded-[32px] border border-blue-100 flex items-center justify-between">
                      <div><p className="text-[10px] font-black text-blue-400 uppercase">Días Hábiles Transcurridos</p><p className="text-4xl font-black text-blue-600">{calcularDiasHabiles(editingDoc.fecha_notificacion)}</p></div>
                      <Clock size={48} className="text-blue-200"/>
                    </div>
                  </div>
                )}

                {activeTab === 3 && (
                  <div className="space-y-10 animate-in fade-in">
                    <div className="bg-slate-50 p-10 rounded-[40px] space-y-6 border border-slate-200">
                      <h4 className="font-black text-xs uppercase text-slate-600 tracking-widest">Registrar Nuevo Seguimiento</h4>
                      <div className="grid grid-cols-2 gap-6">
                        <select className="p-4 rounded-2xl border bg-white font-bold text-xs" id="s_res"><option value="">Responsable...</option>{USUARIOS.map(u => <option key={u.user} value={u.user}>{u.user}</option>)}</select>
                        <select className="p-4 rounded-2xl border bg-white font-bold text-xs" id="s_med"><option value="Llamada">Llamada</option><option value="WhatsApp">WhatsApp</option><option value="Correo">Correo</option></select>
                      </div>
                      <textarea id="s_obs" className="w-full p-5 rounded-2xl border bg-white text-sm outline-none" placeholder="Escriba aquí el detalle del seguimiento..."></textarea>
                      <button onClick={async () => {
                        const r = document.getElementById('s_res').value;
                        const m = document.getElementById('s_med').value;
                        const o = document.getElementById('s_obs').value;
                        if(!r || !o) return alert("Complete los campos.");
                        const { error } = await supabase.from('seguimientos').insert([{ documento_id: editingDoc.id, responsable: r, medio: m, observaciones: o, fecha: new Date().toISOString() }]);
                        if(!error) { 
                          await supabase.from('documentos').update({ ultimo_seguimiento: new Date().toISOString() }).eq('id', editingDoc.id);
                          document.getElementById('s_obs').value = ''; alert("Guardado"); fetchDocs();
                        }
                      }} className="bg-blue-600 text-white font-black py-4 px-10 rounded-2xl text-xs uppercase shadow-xl shadow-blue-200">Grabar Registro</button>
                    </div>
                    <div className="space-y-6">
                       <h4 className="font-black text-[10px] uppercase text-slate-400 tracking-widest">Historial Completo</h4>
                       {seguimientos.map(s => (
                         <div key={s.id} className="p-6 border rounded-[28px] flex items-start gap-5 bg-white shadow-sm">
                           <div className="bg-blue-100 p-4 rounded-2xl text-blue-600 shrink-0"><MessageSquare size={20}/></div>
                           <div><p className="text-xs font-black text-slate-800">{s.responsable} • {s.medio} <span className="text-slate-400 font-normal ml-3">{new Date(s.fecha).toLocaleDateString()}</span></p><p className="text-sm text-slate-500 mt-2 leading-relaxed">{s.observaciones}</p></div>
                         </div>
                       ))}
                    </div>
                  </div>
                )}

                {activeTab === 4 && (
                  <div className="grid grid-cols-2 gap-10 animate-in fade-in">
                    <div className="col-span-2 bg-emerald-50 p-10 rounded-[40px] border border-emerald-100 flex items-center gap-6">
                       <input type="checkbox" className="w-10 h-10 accent-emerald-600 rounded-2xl shadow-sm" checked={editingDoc.cargado_sisged} onChange={e => setEditingDoc({...editingDoc, cargado_sisged: e.target.checked})}/>
                       <label className="font-black text-emerald-900 uppercase text-xs tracking-widest">¿Se cargó correctamente al portal SISGED? (MARCA SI)</label>
                    </div>
                    <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Estado Final de Recuperación</label>
                      <select className="w-full p-5 bg-slate-50 border border-slate-100 rounded-3xl font-black text-xs uppercase" value={editingDoc.estado_final || 'PENDIENTE'} onChange={e => setEditingDoc({...editingDoc, estado_final: e.target.value})}>
                        <option value="PENDIENTE">PENDIENTE</option><option value="RECUPERADO">RECUPERADO</option><option value="RECONSTRUCCION">RECONSTRUCCION</option>
                      </select>
                    </div>
                    <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Oficina de Destino</label>
                      <input type="text" className="w-full p-5 bg-slate-50 border border-slate-100 rounded-3xl font-black text-xs" value={editingDoc.oficina_destino || ''} onChange={e => setEditingDoc({...editingDoc, oficina_destino: e.target.value})}/>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="p-10 bg-slate-50 border-t flex justify-end gap-5 shrink-0">
              <button onClick={() => setEditingDoc(null)} className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-10">Descartar</button>
              <button onClick={async () => {
                const { error } = await supabase.from('documentos').update(editingDoc).eq('id', editingDoc.id);
                if (!error) { alert('Sincronizado'); setEditingDoc(null); fetchDocs(); }
              }} className="bg-blue-600 text-white px-16 py-5 rounded-[24px] font-black text-xs uppercase shadow-2xl shadow-blue-200">Sincronizar Datos</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL NUEVO */}
      {isNewModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[110] p-6">
          <div className="bg-white rounded-[40px] w-full max-w-xl shadow-2xl p-10 space-y-8 border border-white">
            <h3 className="text-xl font-black uppercase text-center tracking-widest">NUEVO EXPEDIENTE</h3>
            <div className="grid grid-cols-2 gap-6">
              <input type="text" placeholder="CUT" className="w-full p-5 bg-slate-50 border rounded-3xl outline-none font-bold text-sm" id="n_cut" />
              <input type="text" placeholder="Documento" className="w-full p-5 bg-slate-50 border rounded-3xl outline-none font-bold text-sm" id="n_doc" />
              <input type="date" className="w-full p-5 bg-slate-50 border rounded-3xl outline-none font-bold text-sm col-span-2" id="n_fecha" />
              <select className="w-full p-5 bg-slate-50 border rounded-3xl font-bold text-sm" id="n_sede"><option value="SC">SC (Sede Central)</option><option value="OD">OD (Órgano Descon.)</option></select>
              <select className="w-full p-5 bg-slate-50 border rounded-3xl font-bold text-sm" id="n_origen"><option value="Externo">Externo</option><option value="Interno">Interno</option></select>
            </div>
            <button onClick={async () => {
              const doc = { 
                cut: document.getElementById('n_cut').value, 
                documento: document.getElementById('n_doc').value,
                fecha_registro: document.getElementById('n_fecha').value,
                sede: document.getElementById('n_sede').value,
                origen: document.getElementById('n_origen').value,
                etapa_actual: '1°VERIFICACION', estado_final: 'PENDIENTE', creado_at: new Date().toISOString()
              };
              const { error } = await supabase.from('documentos').insert([doc]);
              if (!error) { setIsNewModalOpen(false); fetchDocs(); } else alert("Error (CUT duplicado)");
            }} className="w-full bg-blue-600 text-white py-5 rounded-[24px] font-black uppercase shadow-2xl shadow-blue-200 tracking-widest text-sm">Registrar en Sistema</button>
          </div>
        </div>
      )}
    </div>
  );
}
