'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from './lib/supabase';
import * as XLSX from 'xlsx';
import { 
  LayoutDashboard, FileText, Upload, Download, Search, 
  LogOut, ChevronLeft, ChevronRight, Save, Plus, Clock, 
  CheckCircle2, AlertCircle, Trash2, X, CheckSquare, Square, 
  Calendar, Phone, MessageSquare, BarChart3, Truck, Briefcase, UserCheck
} from 'lucide-react';

const USUARIOS = [
  { user: 'ADMINISTRADOR', pass: 'admin123' },
  { user: 'YANINA', pass: '123456' },
  { user: 'CESAR', pass: '123456' },
  { user: 'XINA', pass: '123456' },
  { user: 'FERNANDO', pass: '123456' }
];

const LISTA_RESPONSABLES = ["ADMINISTRADOR", "YANINA", "CESAR", "XINA", "FERNANDO"];

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
  const [activeTab, setActiveTab] = useState(1);
  const [seguimientos, setSeguimientos] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [filters, setFilters] = useState({ search: '', sede: '', origen: '', estado: '', etapa: '', responsable: '', fechaInicio: '', fechaFin: '' });

  const ITEMS_PER_PAGE = 100;

  const getEtapaEstado = useCallback((doc) => {
    if (!doc) return { etapa: '-', estado: '-', color: 'bg-slate-100', border: 'border-slate-300' };
    const origen = String(doc.origen || '').toUpperCase();
    const colK = String(doc.estado_verificacion_k || 'PENDIENTE').toUpperCase();
    const colL = String(doc.estado_visualizacion || '').toUpperCase();
    const colAB = doc.cargado_sisged;

    if (colAB === true || colAB === 'true' || colL === 'SI SE VISUALIZA') return { etapa: 'CIERRE', estado: 'RECUPERADO', color: 'bg-green-100 text-green-700', border: 'border-green-500' };
    if (doc.ultimo_seguimiento) return { etapa: 'SEGUIMIENTO', estado: 'EN PROCESO', color: 'bg-orange-100 text-orange-700', border: 'border-orange-500' };
    if (colK === 'PENDIENTE') return { etapa: 'VERIFICACION', estado: 'PENDIENTE', color: 'bg-red-100 text-red-700', border: 'border-red-500' };
    if (colK === 'VERIFICADO' && colL === 'NO SE VISUALIZA') {
        if (origen === 'INTERNO') return { etapa: 'CIERRE', estado: 'PENDIENTE', color: 'bg-red-100 text-red-700', border: 'border-red-500' };
        if (!doc.numero_documento || doc.numero_documento === '' || doc.numero_documento === 'null') return { etapa: 'REQUERIMIENTO', estado: 'PENDIENTE', color: 'bg-red-100 text-red-700', border: 'border-red-500' };
        return { etapa: 'SEGUIMIENTO', estado: 'PENDIENTE', color: 'bg-red-100 text-red-700', border: 'border-red-500' };
    }
    return { etapa: 'VERIFICACION', estado: 'PENDIENTE', color: 'bg-red-100 text-red-700', border: 'border-red-500' };
  }, []);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    let from = (page - 1) * ITEMS_PER_PAGE;
    let to = from + ITEMS_PER_PAGE - 1;
    let query = supabase.from('documentos').select('*', { count: 'exact' });

    if (filters.search) query = query.or(`cut.ilike.%${filters.search}%,documento.ilike.%${filters.search}%,remitente.ilike.%${filters.search}%`);
    if (filters.sede) query = query.eq('sede', filters.sede);
    if (filters.origen) query = query.eq('origen', filters.origen);
    if (filters.responsable) query = query.or(`responsable_verificacion.eq.${filters.responsable},responsable_requerimiento.eq.${filters.responsable},responsable_devolucion.eq.${filters.responsable}`);
    
    if (filters.estado === 'RECUPERADO') query = query.or('cargado_sisged.eq.true,estado_visualizacion.eq.SI SE VISUALIZA');
    if (filters.estado === 'EN PROCESO') query = query.not('ultimo_seguimiento', 'is', null).eq('cargado_sisged', false).neq('estado_visualizacion', 'SI SE VISUALIZA');
    if (filters.estado === 'PENDIENTE') query = query.is('ultimo_seguimiento', null).eq('cargado_sisged', false).neq('estado_visualizacion', 'SI SE VISUALIZA');

    if (filters.etapa) {
      if (filters.etapa === 'VERIFICACION') query = query.eq('estado_verificacion_k', 'PENDIENTE').eq('cargado_sisged', false);
      else if (filters.etapa === 'REQUERIMIENTO') query = query.eq('origen', 'Externo').eq('estado_verificacion_k', 'VERIFICADO').eq('estado_visualizacion', 'NO SE VISUALIZA').eq('cargado_sisged', false).or('numero_documento.is.null,numero_documento.eq."",numero_documento.eq.null');
      else if (filters.etapa === 'SEGUIMIENTO') query = query.eq('origen', 'Externo').eq('estado_verificacion_k', 'VERIFICADO').eq('estado_visualizacion', 'NO SE VISUALIZA').eq('cargado_sisged', false).not('numero_documento', 'is', null).neq('numero_documento', '').neq('numero_documento', 'null');
      else if (filters.etapa === 'CIERRE') query = query.or('cargado_sisged.eq.true,estado_visualizacion.eq.SI SE VISUALIZA,and(origen.eq.Interno,estado_verificacion_k.eq.VERIFICADO)');
    }

    const { data, count, error } = await query.order('creado_at', { ascending: false }).range(from, to);
    if (!error) { setDocs(data || []); setTotalDocs(count || 0); }
    setLoading(false);
  }, [page, filters]);

  useEffect(() => { if (session) fetchDocs(); }, [session, fetchDocs]);

  const handleSyncChanges = async () => {
    if (!editingDoc) return;
    try {
        setLoading(true);
        const { id, creado_at, ultimo_seguimiento, ...updateData } = editingDoc;
        const { error } = await supabase.from('documentos').update(updateData).eq('id', id);
        if (error) throw error;
        alert('Sincronización Exitosa'); setEditingDoc(null); await fetchDocs();
    } catch (err) { alert('Error: ' + err.message); }
    finally { setLoading(false); }
  };

  const handleLogin = (e) => {
    e.preventDefault();
    const valid = USUARIOS.find(u => u.user.toUpperCase() === loginData.user.toUpperCase() && u.pass === loginData.pass);
    if (valid) setSession(valid); else alert('Credenciales incorrectas');
  };

  useEffect(() => {
    if (editingDoc?.id) {
      supabase.from('seguimientos').select('*').eq('documento_id', editingDoc.id).order('fecha', { ascending: false }).then(({ data }) => setSeguimientos(data || []));
    }
  }, [editingDoc]);

  if (!session) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center p-6">
        <div className="bg-white rounded-4xl shadow-deep w-full max-w-md overflow-hidden border border-white">
          <div className="bg-brand-blue p-12 text-center text-white">
             <h1 className="text-4xl font-black mb-2 tracking-tighter uppercase">SIGERED</h1>
             <p className="text-xs font-bold uppercase tracking-widest opacity-80">Gestión de Recuperación</p>
          </div>
          <form onSubmit={handleLogin} className="p-10 space-y-6"><input type="text" placeholder="Usuario" className="w-full p-5 bg-slate-50 border rounded-3xl outline-none font-bold" onChange={e => setLoginData({...loginData, user: e.target.value})} required /><input type="password" placeholder="Contraseña" className="w-full p-5 bg-slate-50 border rounded-3xl outline-none font-bold" onChange={e => setLoginData({...loginData, pass: e.target.value})} required /><button type="submit" className="w-full bg-brand-blue text-white py-5 rounded-3xl font-black shadow-xl cursor-pointer hover:bg-blue-700 transition-all">INICIAR SESIÓN</button></form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg flex text-slate-900">
      <aside className="w-64 bg-brand-dark text-slate-400 flex flex-col fixed h-full z-20 shadow-deep">
        <div className="p-8 font-black text-white text-2xl tracking-tighter uppercase">SIGERED</div>
        <nav className="flex-1 p-4 space-y-2 mt-4">
          <button onClick={() => setView('dashboard')} className={`w-full flex items-center gap-3 px-5 py-4 rounded-2xl transition-all cursor-pointer ${view === 'dashboard' ? 'bg-brand-blue text-white shadow-lg' : 'hover:bg-slate-800'}`}><LayoutDashboard size={18}/> Dashboard</button>
          <button onClick={() => setView('list')} className={`w-full flex items-center gap-3 px-5 py-4 rounded-2xl transition-all cursor-pointer ${view === 'list' ? 'bg-brand-blue text-white shadow-lg' : 'hover:bg-slate-800'}`}><FileText size={18}/> Gestión</button>
        </nav>
        <div className="p-6 border-t border-slate-800 flex items-center gap-3 bg-slate-900/50">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center font-bold text-white uppercase">{session.user[0]}</div>
          <div className="flex-1 overflow-hidden"><p className="text-xs font-bold text-white truncate uppercase">{session.user}</p></div>
          <button onClick={() => setSession(null)} className="cursor-pointer hover:text-white"><LogOut size={18}/></button>
        </div>
      </aside>

      <main className="ml-64 flex-1 flex flex-col h-screen overflow-hidden">
        <header className="bg-white border-b p-4 flex flex-wrap items-center gap-3 sticky top-0 z-10 px-8 shadow-sm h-auto min-h-[80px]">
          <div className="flex gap-2 mr-auto">
            <button onClick={() => setIsNewModalOpen(true)} className="bg-brand-blue text-white px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-blue-700 transition-all cursor-pointer"><Plus size={14}/> Nuevo</button>
            <button className="bg-white border border-slate-200 px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-slate-50 cursor-pointer"><Download size={14}/> Reporte</button>
          </div>
          <div className="flex flex-wrap items-center gap-2 ml-auto font-bold uppercase">
            <div className="relative"><Search size={14} className="absolute left-3 top-3 text-slate-400"/><input type="text" placeholder="Buscar CUT..." className="bg-slate-50 border-none rounded-xl pl-9 pr-4 py-2.5 text-xs w-32 outline-none focus:ring-2 focus:ring-blue-500 shadow-inner" onChange={e => setFilters({...filters, search: e.target.value})}/></div>
            <select className="border rounded-xl p-2.5 text-[10px] font-black bg-white cursor-pointer outline-none" onChange={e => setFilters({...filters, etapa: e.target.value})}><option value="">ETAPAS</option><option value="VERIFICACION">Verificación</option><option value="REQUERIMIENTO">Requerimiento</option><option value="SEGUIMIENTO">Seguimiento</option><option value="CIERRE">Cierre</option></select>
            <select className="border rounded-xl p-2.5 text-[10px] font-black bg-white cursor-pointer outline-none" onChange={e => setFilters({...filters, estado: e.target.value})}><option value="">ESTADO</option><option value="PENDIENTE">PENDIENTE</option><option value="EN PROCESO">EN PROCESO</option><option value="RECUPERADO">RECUPERADO</option></select>
          </div>
        </header>

        <div className="p-10 overflow-y-auto flex-1">
          {view === 'dashboard' ? (
            <div className="space-y-12 animate-in fade-in">
              <div className="grid grid-cols-4 gap-8">
                {[
                  { label: 'TOTAL REGISTROS', val: totalDocs, color: 'text-slate-800', border: 'border-b-blue-500' },
                  { label: 'PENDIENTES', val: docs.filter(d => getEtapaEstado(d).estado === 'PENDIENTE').length, color: 'text-red-600', border: 'border-b-red-500' },
                  { label: 'EN PROCESO', val: docs.filter(d => getEtapaEstado(d).estado === 'EN PROCESO').length, color: 'text-orange-500', border: 'border-b-orange-500' },
                  { label: 'RECUPERADOS', val: docs.filter(d => getEtapaEstado(d).estado === 'RECUPERADO').length, color: 'text-green-600', border: 'border-b-green-500' }
                ].map((kpi, i) => (
                  <div key={i} className={`bg-white p-8 rounded-3xl shadow-sm border ${kpi.border} border-b-[6px] flex flex-col gap-2 hover:scale-[1.02] transition-transform`}>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{kpi.label}</p>
                    <h3 className={`text-5xl font-black ${kpi.color}`}>{kpi.val}</h3>
                  </div>
                ))}
              </div>
              <div className="bg-brand-blue p-10 rounded-5xl text-white flex items-center justify-between shadow-deep relative overflow-hidden">
                <div className="relative z-10">
                  <h4 className="text-xs font-black uppercase opacity-70 tracking-widest mb-2">Indicador de Éxito</h4>
                  <h3 className="text-6xl font-black">{totalDocs > 0 ? Math.round((docs.filter(d => getEtapaEstado(d).estado === 'RECUPERADO').length / totalDocs) * 100) : 0}%</h3>
                </div>
                <CheckCircle2 size={120} className="opacity-10 absolute -right-4 -bottom-4"/>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-4xl shadow-deep border border-slate-100 overflow-hidden animate-in fade-in">
               <table className="w-full text-left">
                <thead className="bg-slate-50 border-b text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <tr>
                    <th className="p-6 pl-10 w-16 text-center border-r font-sans"><Square size={20} className="text-slate-300 mx-auto"/></th>
                    <th className="p-6 uppercase">CUT / Documento</th>
                    <th className="p-6 text-center uppercase">Sede / Origen</th>
                    <th className="p-6 text-center uppercase">Etapa / Estado</th>
                    <th className="p-6 text-center uppercase">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-sm">
                  {docs.map(doc => {
                    const status = getEtapaEstado(doc);
                    return (
                      <tr key={doc.id} className="hover:bg-slate-50/80 transition-all">
                        <td className="p-6 text-center border-r"><button onClick={() => setSelectedIds(prev => prev.includes(doc.id) ? prev.filter(i => i !== doc.id) : [...prev, doc.id])}>{selectedIds.includes(doc.id) ? <CheckSquare size={22} className="text-brand-blue mx-auto"/> : <Square size={22} className="text-slate-200 mx-auto"/>}</button></td>
                        <td className="p-6">
                            <p className="font-black text-slate-800 text-sm">{doc.cut}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase mt-1 truncate max-w-[300px]">{doc.documento}</p>
                        </td>
                        <td className="p-6 text-center">
                          <p className="font-black text-[10px] text-slate-600 uppercase">{doc.sede}</p>
                          <p className="text-[9px] font-bold text-blue-500 uppercase">{doc.origen}</p>
                        </td>
                        <td className="p-6 text-center"><div className="flex flex-col items-center gap-1 mx-auto"><span className="text-[9px] font-black bg-slate-200 text-slate-500 px-3 py-1 rounded-lg uppercase">{status.etapa}</span><span className={`text-[10px] font-black px-4 py-1.5 rounded-xl border uppercase ${status.color}`}>{status.estado}</span></div></td>
                        <td className="p-6 text-center"><button onClick={() => { setEditingDoc(doc); setActiveTab(1); }} className="bg-white border-2 border-blue-50 text-brand-blue font-black text-[10px] px-5 py-2.5 rounded-2xl hover:bg-brand-blue hover:text-white transition-all cursor-pointer">DETALLES</button></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div className="p-10 bg-slate-50 flex justify-between items-center border-t border-slate-100 font-sans"><p className="text-xs font-black text-slate-400 uppercase tracking-widest">Página {page} • Total: {totalDocs}</p>
                <div className="flex gap-4"><button onClick={() => setPage(p => p - 1)} disabled={page === 1} className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center hover:bg-brand-blue hover:text-white shadow-sm disabled:opacity-20 transition-all cursor-pointer"><ChevronLeft size={20}/></button><button onClick={() => setPage(p => p + 1)} disabled={page * 100 >= totalDocs} className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center hover:bg-brand-blue hover:text-white shadow-sm disabled:opacity-20 transition-all cursor-pointer"><ChevronRight size={20}/></button></div>
              </div>
            </div>
          )}
        </div>
      </main>

      {editingDoc && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md flex items-center justify-center z-[100] p-10 animate-in fade-in">
          <div className="bg-white rounded-5xl w-full max-w-6xl h-[88vh] flex flex-col overflow-hidden shadow-deep">
            <div className="p-10 bg-brand-dark text-white flex justify-between items-center">
              <div><h3 className="text-2xl font-black">{editingDoc.cut} • {editingDoc.documento}</h3><p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest mt-2">{editingDoc.origen} • {editingDoc.sede}</p></div>
              <button onClick={() => setEditingDoc(null)} className="w-12 h-12 rounded-2xl bg-white/10 hover:bg-white/20 flex items-center justify-center font-bold transition-transform hover:rotate-90 cursor-pointer">✕</button>
            </div>
            <div className="flex flex-1 overflow-hidden">
              <div className="w-80 bg-slate-50 border-r p-10 space-y-4 shrink-0 font-bold">
                <button onClick={() => setActiveTab(1)} className={`w-full text-left p-6 rounded-3xl font-black text-xs transition-all flex items-center justify-between cursor-pointer ${activeTab === 1 ? 'bg-white border-2 border-brand-blue text-brand-blue shadow-lg' : 'text-slate-400'}`}>1. VERIFICACIÓN <UserCheck size={16}/></button>
                {String(editingDoc.origen).toUpperCase() === 'EXTERNO' && (
                  <>
                    <button onClick={() => setActiveTab(2)} className={`w-full text-left p-6 rounded-3xl font-black text-xs transition-all flex items-center justify-between cursor-pointer ${activeTab === 2 ? 'bg-white border-2 border-brand-blue text-brand-blue shadow-lg' : 'text-slate-400'}`}>2. REQUERIMIENTO <Truck size={16}/></button>
                    <button onClick={() => setActiveTab(3)} className={`w-full text-left p-6 rounded-3xl font-black text-xs transition-all flex items-center justify-between cursor-pointer ${activeTab === 3 ? 'bg-white border-2 border-brand-blue text-brand-blue shadow-lg' : 'text-slate-400'}`}>3. SEGUIMIENTO ({seguimientos.length}) <MessageSquare size={16}/></button>
                  </>
                )}
                <button onClick={() => setActiveTab(4)} className={`w-full text-left p-6 rounded-3xl font-black text-xs transition-all flex items-center justify-between cursor-pointer ${activeTab === 4 ? 'bg-white border-2 border-brand-blue text-brand-blue shadow-lg' : 'text-slate-400'}`}>4. CIERRE <Save size={16}/></button>
              </div>
              <div className="flex-1 p-14 overflow-y-auto bg-white">
                {activeTab === 1 && (
                  <div className="grid grid-cols-2 gap-12 animate-in fade-in">
                    <div className="space-y-3"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Resp. Verificación</label><select className="w-full p-5 bg-slate-50 border border-slate-100 rounded-3xl font-black text-xs uppercase cursor-pointer" value={editingDoc.responsable_verificacion || ''} onChange={e => setEditingDoc({...editingDoc, responsable_verificacion: e.target.value})}><option value="">SELECCIONE...</option>{LISTA_RESPONSABLES.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
                    <div className="space-y-3"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Fecha Verificación</label><input type="date" className="w-full p-5 bg-slate-50 border border-slate-100 rounded-3xl font-black text-xs" value={editingDoc.fecha_verificacion || ''} onChange={e => setEditingDoc({...editingDoc, fecha_verificacion: e.target.value})}/></div>
                    <div className="col-span-2 space-y-6 pt-6 text-center"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Estado de Visualización</p><div className="grid grid-cols-2 gap-8"><button onClick={() => setEditingDoc({...editingDoc, estado_visualizacion: 'SI SE VISUALIZA'})} className={`p-10 rounded-4xl border-2 font-black text-sm transition-all flex flex-col items-center gap-4 cursor-pointer ${editingDoc.estado_visualizacion === 'SI SE VISUALIZA' ? 'border-green-600 bg-green-50 text-green-700 shadow-lg' : 'border-slate-50 bg-slate-50 text-slate-300'}`}><CheckCircle2 size={32}/> SÍ SE VISUALIZA</button><button onClick={() => setEditingDoc({...editingDoc, estado_visualizacion: 'NO SE VISUALIZA'})} className={`p-10 rounded-4xl border-2 font-black text-sm transition-all flex flex-col items-center gap-4 cursor-pointer ${editingDoc.estado_visualizacion === 'NO SE VISUALIZA' ? 'border-red-600 bg-red-50 text-red-700 shadow-lg' : 'border-slate-50 bg-slate-50 text-slate-300'}`}><AlertCircle size={32}/> NO SE VISUALIZA</button></div></div>
                  </div>
                )}
                {activeTab === 2 && (
                  <div className="grid grid-cols-2 gap-12 animate-in fade-in">
                    <div className="space-y-3"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Número de Documento Generado</label><input type="text" className="w-full p-5 bg-slate-50 border border-slate-100 rounded-3xl font-black text-xs" value={editingDoc.numero_documento || ''} onChange={e => setEditingDoc({...editingDoc, numero_documento: e.target.value})}/></div>
                    <div className="space-y-3"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Fecha de Notificación</label><input type="date" className="w-full p-5 bg-slate-50 border border-slate-100 rounded-3xl font-black text-xs" value={editingDoc.fecha_notificacion || ''} onChange={e => setEditingDoc({...editingDoc, fecha_notificacion: e.target.value})}/></div>
                  </div>
                )}
                {activeTab === 3 && (
                  <div className="space-y-12 animate-in fade-in">
                    <div className="bg-slate-50 p-10 rounded-4xl space-y-6 border border-slate-200">
                      <h4 className="font-black text-xs uppercase text-slate-600">Registrar Nuevo Seguimiento</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <select className="w-full p-5 rounded-2xl border bg-white font-black text-[10px] uppercase outline-none" id="s_res"><option value="">RESPONSABLE...</option>{LISTA_RESPONSABLES.map(r => <option key={r} value={r}>{r}</option>)}</select>
                        <select className="w-full p-5 rounded-2xl border bg-white font-black text-[10px] uppercase outline-none" id="s_med"><option value="">MEDIO...</option><option value="LLAMADA">LLAMADA</option><option value="WHATSAPP">WHATSAPP</option><option value="CORREO">CORREO</option></select>
                      </div>
                      <textarea id="s_obs" className="w-full p-6 rounded-3xl border border-slate-100 bg-white text-sm outline-none font-medium" rows="3" placeholder="Detalles del contacto..."></textarea>
                      <button onClick={async () => {
                        const o = document.getElementById('s_obs').value, r = document.getElementById('s_res').value, m = document.getElementById('s_med').value, f = new Date().toISOString().split('T')[0];
                        if(!o || !r || !m) return alert("Complete campos.");
                        const now = new Date().toISOString();
                        await supabase.from('seguimientos').insert([{ documento_id: editingDoc.id, responsable: r, medio: m, observaciones: o, fecha: f }]);
                        await supabase.from('documentos').update({ ultimo_seguimiento: now }).eq('id', editingDoc.id);
                        setEditingDoc(prev => ({ ...prev, ultimo_seguimiento: now }));
                        document.getElementById('s_obs').value = '';
                        const { data } = await supabase.from('seguimientos').select('*').eq('documento_id', editingDoc.id).order('fecha', { ascending: false });
                        setSeguimientos(data || []); fetchDocs();
                      }} className="bg-brand-blue text-white font-black py-5 px-12 rounded-3xl text-xs uppercase shadow-lg cursor-pointer hover:scale-105 transition-all">Grabar Seguimiento</button>
                    </div>
                  </div>
                )}
                {activeTab === 4 && (
                  <div className="grid grid-cols-2 gap-12 animate-in fade-in">
                    <div className="col-span-2 bg-emerald-50 p-12 rounded-5xl border border-emerald-100 flex items-center gap-8 shadow-inner">
                      <input type="checkbox" className="w-12 h-12 accent-emerald-600 rounded-2xl cursor-pointer" checked={editingDoc.cargado_sisged} onChange={e => setEditingDoc({...editingDoc, cargado_sisged: e.target.checked})}/>
                      <div><label className="font-black text-emerald-900 uppercase text-xs block mb-1">Cargado en SISGED (Col AB)</label><p className="text-[10px] text-emerald-700 font-bold opacity-60">Marque para finalizar recuperación.</p></div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="p-10 bg-slate-50 border-t flex justify-end gap-6 shrink-0"><button onClick={() => setEditingDoc(null)} className="text-[10px] font-black text-slate-400 uppercase px-10 hover:text-slate-700 cursor-pointer">Descartar</button><button onClick={handleSyncChanges} className="bg-brand-blue text-white px-16 py-5 rounded-3xl font-black text-xs uppercase shadow-deep hover:scale-105 transition-all cursor-pointer">SINCRONIZAR CAMBIOS</button></div>
          </div>
        </div>
      )}

      {isNewModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xl flex items-center justify-center z-[110] p-6 animate-in zoom-in">
          <div className="bg-white rounded-5xl w-full max-w-xl shadow-deep p-12 space-y-10 border border-white relative">
            <button onClick={() => setIsNewModalOpen(false)} className="absolute right-8 top-8 text-slate-300 hover:text-slate-600 cursor-pointer"><X/></button>
            <h3 className="text-2xl font-black uppercase text-center text-slate-800">Nuevo Expediente</h3>
            <div className="grid grid-cols-2 gap-6">
              <input type="text" placeholder="CUT" className="w-full p-5 bg-slate-50 border-none rounded-3xl outline-none font-bold" id="n_cut" />
              <input type="text" placeholder="Documento" className="w-full p-5 bg-slate-50 border-none rounded-3xl outline-none font-bold" id="n_doc" />
              <input type="text" placeholder="Remitente" className="w-full p-5 bg-slate-50 border-none rounded-3xl outline-none font-bold col-span-2" id="n_rem" />
              <select className="w-full p-5 bg-slate-50 border-none rounded-3xl font-black text-[10px] uppercase cursor-pointer" id="n_sede"><option value="SC">SEDE CENTRAL (SC)</option><option value="OD">ÓRGANO DESCONCENTRADO (OD)</option></select>
              <select className="w-full p-5 bg-slate-50 border-none rounded-3xl font-black text-[10px] uppercase cursor-pointer" id="n_origen"><option value="Externo">Externo</option><option value="Interno">Interno</option></select>
            </div>
            <button onClick={async () => {
              const doc = { cut: document.getElementById('n_cut').value, documento: document.getElementById('n_doc').value, remitente: document.getElementById('n_rem').value, sede: document.getElementById('n_sede').value, origen: document.getElementById('n_origen').value, etapa_actual: 'VERIFICACION', estado_final: 'PENDIENTE', creado_at: new Date().toISOString() };
              const { error } = await supabase.from('documentos').insert([doc]);
              if (!error) { setIsNewModalOpen(false); fetchDocs(); } else alert("Error (Verifique CUT duplicado)");
            }} className="w-full bg-brand-blue text-white py-6 rounded-3xl font-black uppercase shadow-deep hover:bg-blue-700 transition-all cursor-pointer">Registrar Documento</button>
          </div>
        </div>
      )}
    </div>
  );
}
