'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import * as XLSX from 'xlsx';
import { 
  LayoutDashboard, FileText, Upload, Download, Search, 
  LogOut, ChevronLeft, ChevronRight, Save, Plus, Clock, 
  CheckCircle2, AlertCircle, Trash2, Bell, User, Settings, Filter, RefreshCcw
} from 'lucide-react';

// USUARIOS SEGÚN REQUERIMIENTO
const USUARIOS = [
  { user: 'Administrador', pass: 'admin123', email: 'admin@institucion.gob.pe' },
  { user: 'Yanina', pass: '123456', email: 'yanina@institucion.gob.pe' },
  { user: 'Cesar', pass: '123456', email: 'cesar@institucion.gob.pe' },
  { user: 'Xina', pass: '123456', email: 'xina@institucion.gob.pe' },
  { user: 'Fernando', pass: '123456', email: 'fernando@institucion.gob.pe' }
];

export default function SistemaSIGERED() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [docs, setDocs] = useState([]);
  const [totalDocs, setTotalDocs] = useState(0);
  const [page, setPage] = useState(1);
  const [view, setView] = useState('dashboard');
  const [editingDoc, setEditingDoc] = useState(null);
  const [loginData, setLoginData] = useState({ user: '', pass: '' });
  const [filters, setFilters] = useState({ search: '', sede: '', etapa: '' });

  const ITEMS_PER_PAGE = 100;

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    let from = (page - 1) * ITEMS_PER_PAGE;
    let to = from + ITEMS_PER_PAGE - 1;

    let query = supabase.from('documentos').select('*', { count: 'exact' });
    if (filters.search) query = query.or(`cut.ilike.%${filters.search}%,documento.ilike.%${filters.search}%`);
    if (filters.sede) query = query.eq('sede', filters.sede);
    if (filters.etapa) query = query.eq('etapa_actual', filters.etapa);

    const { data, count, error } = await query.order('creado_at', { ascending: false }).range(from, to);
    if (!error) { setDocs(data); setTotalDocs(count); }
    setLoading(false);
  }, [page, filters]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  const handleLogin = (e) => {
    e.preventDefault();
    const valid = USUARIOS.find(u => u.user === loginData.user && u.pass === loginData.pass);
    if (valid) setSession(valid);
    else alert('Credenciales incorrectas');
  };

  // ESTILOS DE ESTADOS SEGÚN TUS REGLAS
  const getStatusStyles = (doc) => {
    if (!doc.cargado_sisged && doc.etapa_actual !== 'VERIFICACION') {
      return { label: 'EN PROCESO', bg: 'bg-orange-100 text-orange-700 border-orange-200' };
    }
    switch (doc.estado_final) {
      case 'RECUPERADO': return { label: 'RECUPERADO', bg: 'bg-green-100 text-green-700 border-green-200' };
      case 'PENDIENTE': return { label: 'PENDIENTE', bg: 'bg-red-100 text-red-700 border-red-200' };
      case 'RECONSTRUCCION': return { label: 'RECONSTRUCCION', bg: 'bg-gray-100 text-gray-700 border-gray-200' };
      default: return { label: 'PENDIENTE', bg: 'bg-red-100 text-red-700 border-red-200' };
    }
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-[#F0F4F8] flex items-center justify-center p-6 font-sans" style={{backgroundImage: 'radial-gradient(#d1d5db 1px, transparent 1px)', backgroundSize: '20px 20px'}}>
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-white">
          <div className="bg-[#2563EB] p-10 text-center text-white relative">
            <div className="bg-white/20 w-20 h-20 rounded-2xl mx-auto mb-4 flex items-center justify-center backdrop-blur-md">
              <FileText size={40} />
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight">SIGERED</h1>
            <p className="text-blue-100 mt-2 font-medium uppercase text-sm tracking-widest">Sistema de Recuperación de Documentos</p>
          </div>
          <form onSubmit={handleLogin} className="p-10 space-y-6">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2 ml-1">Correo Institucional</label>
              <input type="text" placeholder="usuario@institucion.gob.pe" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-100 outline-none transition-all" 
                onChange={e => setLoginData({...loginData, user: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2 ml-1">Contraseña</label>
              <input type="password" placeholder="••••••" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-100 outline-none transition-all" 
                onChange={e => setLoginData({...loginData, pass: e.target.value})} />
            </div>
            <button className="w-full bg-[#2563EB] text-white py-4 rounded-2xl font-bold text-lg hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-2">
              Iniciar Sesión <ChevronRight size={20} />
            </button>
            <p className="text-center text-slate-400 text-xs mt-4">Solicite sus credenciales al administrador del sistema.</p>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex font-sans text-slate-900">
      {/* SIDEBAR ESTILO DARK */}
      <aside className="w-72 bg-[#1E293B] text-slate-300 flex flex-col fixed h-full shadow-2xl z-20">
        <div className="p-8">
          <div className="flex items-center gap-3 text-white mb-2">
            <div className="bg-blue-600 p-2 rounded-lg"><FileText size={20}/></div>
            <span className="font-black text-xl tracking-tighter">SIGERED <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-md ml-1 border border-blue-500/30">v2.4</span></span>
          </div>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest ml-1">Gestión Documental</p>
        </div>

        <nav className="flex-1 px-4 space-y-1">
          <button onClick={() => setView('dashboard')} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all font-medium ${view === 'dashboard' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' : 'hover:bg-slate-800'}`}>
            <LayoutDashboard size={18} /> Dashboard
          </button>
          <button onClick={() => setView('list')} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all font-medium ${view === 'list' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' : 'hover:bg-slate-800'}`}>
            <FileText size={18} /> Gestión de Registros
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl hover:bg-slate-800 transition-all font-medium text-slate-400 opacity-60 cursor-not-allowed">
            <Download size={18} /> Reportes Excel
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl hover:bg-slate-800 transition-all font-medium text-slate-400 opacity-60 cursor-not-allowed">
            <Plus size={18} /> Usuarios
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl hover:bg-slate-800 transition-all font-medium text-slate-400 opacity-60 cursor-not-allowed">
            <Settings size={18} /> Configuración
          </button>
        </nav>

        <div className="p-6 bg-slate-900/50 border-t border-slate-800">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-sm shadow-inner">{session.user[0]}</div>
            <div className="overflow-hidden">
              <p className="text-xs font-bold text-white truncate">{session.email}</p>
              <p className="text-[10px] text-slate-500 uppercase font-black">Sede Central</p>
            </div>
            <button onClick={() => setSession(null)} className="ml-auto text-slate-500 hover:text-white transition-colors"><LogOut size={18} /></button>
          </div>
        </div>
      </aside>

      {/* CONTENIDO PRINCIPAL */}
      <main className="ml-72 flex-1 flex flex-col h-screen">
        {/* TOP BAR */}
        <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold text-slate-800 uppercase tracking-tight">{view === 'dashboard' ? 'SIGERED' : 'Registros'}</h2>
            <div className="flex gap-2">
                <button className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 hover:bg-blue-700 transition-all"><Plus size={14}/> Nuevo Registro</button>
                <label className="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 hover:bg-slate-50 cursor-pointer transition-all"><Upload size={14}/> Importar <input type="file" className="hidden" onChange={() => {}}/></label>
                <button className="bg-white border border-red-200 text-red-500 px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 hover:bg-red-50 transition-all"><RefreshCcw size={14}/> Limpiar Base</button>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
              <input type="text" placeholder="Buscar CUT, Doc, Remitente..." className="bg-slate-100 border-none rounded-xl pl-10 pr-4 py-2.5 text-sm w-80 focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
            </div>
            <div className="relative">
              <Bell className="text-slate-400 hover:text-blue-600 cursor-pointer transition-colors" size={20} />
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 border-2 border-white rounded-full text-[8px] flex items-center justify-center text-white font-bold">3</span>
            </div>
            <div className="w-10 h-10 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center text-slate-600 font-bold text-xs">B</div>
          </div>
        </header>

        <div className="p-10 overflow-y-auto flex-1">
          {view === 'dashboard' ? (
            <div className="space-y-10">
              {/* DASHBOARD CARDS */}
              <div className="grid grid-cols-4 gap-8">
                <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Documentos</p>
                    <h3 className="text-4xl font-black text-slate-800">{totalDocs}</h3>
                  </div>
                  <div className="w-14 h-14 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center shadow-sm"><FileText size={24}/></div>
                </div>
                <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Pendientes Verificación</p>
                    <h3 className="text-4xl font-black text-slate-800">{docs.filter(d => d.etapa_actual === 'VERIFICACION').length}</h3>
                  </div>
                  <div className="w-14 h-14 bg-orange-100 text-orange-500 rounded-2xl flex items-center justify-center shadow-sm"><Clock size={24}/></div>
                </div>
                <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Sin Seguimiento</p>
                    <h3 className="text-4xl font-black text-slate-800">1</h3>
                  </div>
                  <div className="w-14 h-14 bg-rose-100 text-rose-500 rounded-2xl flex items-center justify-center shadow-sm"><AlertCircle size={24}/></div>
                </div>
                <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Recuperados</p>
                    <h3 className="text-4xl font-black text-slate-800">{docs.filter(d => d.estado_final === 'RECUPERADO').length}</h3>
                  </div>
                  <div className="w-14 h-14 bg-emerald-100 text-emerald-500 rounded-2xl flex items-center justify-center shadow-sm"><CheckCircle2 size={24}/></div>
                </div>
              </div>

              {/* GRÁFICOS Y ALERTAS */}
              <div className="grid grid-cols-12 gap-8">
                <div className="col-span-8 bg-white p-10 rounded-[40px] border border-slate-100 shadow-sm">
                   <h4 className="text-xl font-bold text-slate-800 mb-8">Distribución por Etapa</h4>
                   <div className="space-y-10">
                      {[
                        {n: 1, name: 'Verificación', color: 'bg-orange-500', w: '65%'},
                        {n: 2, name: 'Requerimiento / Notificación', color: 'bg-blue-600', w: '27.5%'},
                        {n: 3, name: 'Seguimiento', color: 'bg-purple-500', w: '0.1%'},
                        {n: 4, name: 'Cierre / Recuperación', color: 'bg-emerald-500', w: '7.4%'}
                      ].map(item => (
                        <div key={item.n} className="space-y-3">
                          <div className="flex justify-between items-center text-sm">
                            <div className="flex items-center gap-4">
                                <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${item.color.replace('bg-', 'bg-').replace('500', '100')} ${item.color.replace('bg-', 'text-')}`}>{item.n}</span>
                                <span className="font-bold text-slate-600">{item.name}</span>
                            </div>
                            <span className="font-black text-slate-800">{docs.filter(d => d.etapa_actual.includes(item.name.split(' ')[0].toUpperCase())).length} docs ({item.w})</span>
                          </div>
                          <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full ${item.color} rounded-full transition-all duration-1000`} style={{width: item.w}}></div>
                          </div>
                        </div>
                      ))}
                   </div>
                </div>
                
                <div className="col-span-4 space-y-6">
                   <h4 className="text-xl font-bold text-slate-800 ml-2">Alertas del Sistema</h4>
                   <div className="bg-rose-50 border border-rose-100 p-6 rounded-3xl flex gap-4">
                      <div className="bg-rose-500 text-white w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-rose-200"><AlertCircle size={20}/></div>
                      <div>
                        <p className="font-bold text-rose-800 text-sm">Falta Seguimiento</p>
                        <p className="text-rose-600 text-xs mt-1">1 documentos externos requieren atención inmediata.</p>
                      </div>
                   </div>
                   <div className="bg-orange-50 border border-orange-100 p-6 rounded-3xl flex gap-4">
                      <div className="bg-orange-500 text-white w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-orange-200"><Clock size={20}/></div>
                      <div>
                        <p className="font-bold text-orange-800 text-sm">Verificación Pendiente</p>
                        <p className="text-orange-600 text-xs mt-1">Hay {totalDocs} documentos nuevos sin procesar.</p>
                      </div>
                   </div>
                   <div className="bg-blue-50 border border-blue-100 p-6 rounded-3xl flex gap-4">
                      <div className="bg-blue-500 text-white w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-blue-200"><Bell size={20}/></div>
                      <div>
                        <p className="font-bold text-blue-800 text-sm">Indicador de Calidad</p>
                        <p className="text-blue-600 text-xs mt-1">El 100.0% de los documentos que llegan a etapa de cierre son recuperados.</p>
                      </div>
                   </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-[40px] shadow-sm border border-slate-100 overflow-hidden">
               {/* BARRA DE FILTROS EN TABLA */}
               <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-white">
                  <div className="flex gap-4">
                    <div className="flex items-center gap-3 bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-100">
                       <Filter size={14} className="text-slate-400"/>
                       <span className="text-[10px] font-black uppercase text-slate-400 mr-2">Filtrar por:</span>
                       <select className="bg-transparent border-none outline-none text-xs font-bold text-slate-700 uppercase" onChange={e => setFilters({...filters, etapa: e.target.value})}>
                          <option value="">Todas las Etapas</option>
                          <option value="VERIFICACION">Etapa 1: Verificación</option>
                          <option value="CIERRE">Etapa 4: Cierre</option>
                       </select>
                    </div>
                    <select className="bg-slate-50 px-6 py-2.5 rounded-xl border border-slate-100 text-xs font-bold text-slate-700 uppercase outline-none" onChange={e => setFilters({...filters, sede: e.target.value})}>
                        <option value="">Todas las Sedes</option>
                        <option value="OD">Sede OD</option>
                        <option value="CENTRAL">Sede Central</option>
                    </select>
                  </div>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Mostrando: {totalDocs} Registros</span>
               </div>

               <table className="w-full text-left border-collapse">
                <thead className="bg-white">
                  <tr>
                    <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 pl-10"><input type="checkbox" className="rounded-md w-4 h-4" /></th>
                    <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50">Cut</th>
                    <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50">Documento</th>
                    <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 text-center">Sede</th>
                    <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 text-center">Origen</th>
                    <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 text-center">Etapa / Estado</th>
                    <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {docs.map(doc => {
                    const status = getStatusStyles(doc);
                    return (
                      <tr key={doc.id} className="hover:bg-slate-50/50 transition-all">
                        <td className="p-6 pl-10"><input type="checkbox" className="rounded-md w-4 h-4" /></td>
                        <td className="p-6 font-black text-slate-700 text-sm">{doc.cut}</td>
                        <td className="p-6 text-xs font-bold text-slate-500 max-w-xs truncate">{doc.documento}</td>
                        <td className="p-6 text-center text-xs font-black text-slate-600">{doc.sede || 'OD'}</td>
                        <td className="p-6 text-center">
                          <span className="bg-emerald-100 text-emerald-700 text-[10px] font-black px-3 py-1.5 rounded-lg border border-emerald-200">EXTERNO</span>
                        </td>
                        <td className="p-6">
                           <div className="flex flex-col items-center gap-1">
                              <span className="text-[9px] font-black bg-slate-100 text-slate-500 px-2 py-0.5 rounded border border-slate-200">ETAPA 1</span>
                              <span className={`text-[10px] font-black px-4 py-1.5 rounded-xl border uppercase shadow-sm ${status.bg}`}>{status.label}</span>
                           </div>
                        </td>
                        <td className="p-6">
                          <div className="flex items-center justify-center gap-2">
                             <button onClick={() => setEditingDoc(doc)} className="bg-white border border-blue-200 text-blue-600 px-4 py-2 rounded-xl font-bold text-[10px] flex items-center gap-2 hover:bg-blue-50 transition-all shadow-sm shadow-blue-50"> <ChevronRight size={14}/> DETALLES</button>
                             <button className="bg-white border border-rose-100 text-rose-500 px-4 py-2 rounded-xl font-bold text-[10px] flex items-center gap-2 hover:bg-rose-50 transition-all shadow-sm shadow-rose-50"> <Trash2 size={14}/> ELIMINAR</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              <div className="p-10 bg-slate-50/50 border-t border-slate-50 flex items-center justify-between">
                <p className="text-xs font-bold text-slate-400">PÁGINA <span className="text-slate-800">{page}</span> DE <span className="text-slate-800">{Math.ceil(totalDocs/100)}</span></p>
                <div className="flex gap-4">
                  <button onClick={() => setPage(p => p - 1)} disabled={page === 1} className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center hover:bg-blue-600 hover:text-white transition-all disabled:opacity-30 shadow-sm"><ChevronLeft size={20}/></button>
                  <button onClick={() => setPage(p => p + 1)} disabled={page * 100 >= totalDocs} className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center hover:bg-blue-600 hover:text-white transition-all disabled:opacity-30 shadow-sm"><ChevronRight size={20}/></button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* EL MODAL DE EDICIÓN SE MANTIENE POR ETAPAS SEGÚN REQUERIMIENTO */}
      {editingDoc && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-10 z-[100]">
           <div className="bg-white rounded-[40px] w-full max-w-6xl h-[85vh] overflow-hidden shadow-2xl flex flex-col border border-white">
              <div className="p-10 bg-[#1E293B] text-white flex justify-between items-center">
                 <div>
                    <h3 className="text-2xl font-black">Actualización de Registro</h3>
                    <p className="text-slate-400 text-xs mt-1 uppercase font-bold tracking-widest">Expediente: <span className="text-blue-400">{editingDoc.cut}</span> • Doc: <span className="text-blue-400">{editingDoc.documento}</span></p>
                 </div>
                 <button onClick={() => setEditingDoc(null)} className="w-12 h-12 rounded-2xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all">✕</button>
              </div>
              <div className="flex flex-1 overflow-hidden">
                 <div className="w-80 bg-slate-50 border-r border-slate-100 p-10 space-y-4">
                    <button className="w-full text-left p-6 rounded-[25px] bg-white border-2 border-blue-600 text-blue-700 font-black text-sm shadow-xl shadow-blue-900/10 transition-all flex items-center justify-between">1. Verificación <CheckCircle2 size={18}/></button>
                    <button className="w-full text-left p-6 rounded-[25px] text-slate-400 font-bold text-sm hover:bg-white transition-all flex items-center justify-between">2. Requerimiento <Clock size={18}/></button>
                    <button className="w-full text-left p-6 rounded-[25px] text-slate-400 font-bold text-sm hover:bg-white transition-all flex items-center justify-between">3. Seguimiento <Clock size={18}/></button>
                    <button className="w-full text-left p-6 rounded-[25px] text-slate-400 font-bold text-sm hover:bg-white transition-all flex items-center justify-between">4. Cierre <Clock size={18}/></button>
                 </div>
                 <div className="flex-1 p-12 overflow-y-auto bg-white">
                    <div className="grid grid-cols-2 gap-12">
                       <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Responsable</label>
                          <select className="w-full p-5 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-blue-100 transition-all" value={editingDoc.responsable_verificacion || ''} onChange={e => setEditingDoc({...editingDoc, responsable_verificacion: e.target.value})}>
                            <option value="">Seleccione...</option>
                            {USUARIOS.map(u => <option key={u.user} value={u.user}>{u.user}</option>)}
                          </select>
                       </div>
                       <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Fecha</label>
                          <input type="date" className="w-full p-5 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-blue-100 transition-all" value={editingDoc.fecha_verificacion || ''} onChange={e => setEditingDoc({...editingDoc, fecha_verificacion: e.target.value})} />
                       </div>
                       <div className="col-span-2 space-y-4">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Visualización del Documento</label>
                          <div className="grid grid-cols-2 gap-6">
                             <button onClick={() => setEditingDoc({...editingDoc, estado_visualizacion: 'SI SE VISUALIZA'})} className={`p-8 rounded-3xl border-2 transition-all flex items-center justify-center gap-3 font-black text-sm ${editingDoc.estado_visualizacion === 'SI SE VISUALIZA' ? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-lg shadow-emerald-900/10' : 'border-slate-100 bg-slate-50 text-slate-400'}`}> <CheckCircle2/> SÍ SE VISUALIZA</button>
                             <button onClick={() => setEditingDoc({...editingDoc, estado_visualizacion: 'NO SE VISUALIZA'})} className={`p-8 rounded-3xl border-2 transition-all flex items-center justify-center gap-3 font-black text-sm ${editingDoc.estado_visualizacion === 'NO SE VISUALIZA' ? 'border-rose-500 bg-rose-50 text-rose-700 shadow-lg shadow-rose-900/10' : 'border-slate-100 bg-slate-50 text-slate-400'}`}> <AlertCircle/> NO SE VISUALIZA</button>
                          </div>
                       </div>
                       <div className="col-span-2 bg-blue-50/50 p-8 rounded-[35px] border border-blue-100 space-y-6">
                          <div className="flex items-center gap-3">
                            <div className="bg-blue-600 text-white w-8 h-8 rounded-lg flex items-center justify-center shadow-lg"><Plus size={16}/></div>
                            <span className="font-black text-blue-900 uppercase text-xs tracking-tighter">Control de Cierre / SISGED</span>
                          </div>
                          <div className="flex items-center gap-4 bg-white p-6 rounded-2xl border border-blue-100">
                             <input type="checkbox" className="w-6 h-6 rounded-lg accent-blue-600 cursor-pointer" checked={editingDoc.cargado_sisged} onChange={e => setEditingDoc({...editingDoc, cargado_sisged: e.target.checked})} />
                             <label className="font-bold text-slate-700 text-sm">¿Se encuentra cargado en el portal SISGED?</label>
                          </div>
                       </div>
                    </div>
                 </div>
              </div>
              <div className="p-10 bg-slate-50 border-t border-slate-100 flex justify-end gap-6">
                 <button onClick={() => setEditingDoc(null)} className="text-xs font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-all">Descartar</button>
                 <button onClick={async () => {
                    const { error } = await supabase.from('documentos').update(editingDoc).eq('id', editingDoc.id);
                    if (!error) { alert('Datos actualizados'); setEditingDoc(null); fetchDocs(); }
                 }} className="bg-[#2563EB] text-white px-12 py-5 rounded-2xl font-black text-sm shadow-xl shadow-blue-900/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-3 uppercase"><Save size={18}/> Guardar Registro</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}
