'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import * as XLSX from 'xlsx';
import { 
  LayoutDashboard, FileText, Upload, Download, Search, 
  Filter, LogOut, ChevronLeft, ChevronRight, Save, Plus, Clock, CheckCircle2, AlertCircle
} from 'lucide-react';

// --- CONFIGURACIÓN DE USUARIOS ---
const USUARIOS_AUTORIZADOS = [
  { user: 'Administrador', pass: 'admin123' },
  { user: 'Yanina', pass: '123456' },
  { user: 'Cesar', pass: '123456' },
  { user: 'Xina', pass: '123456' },
  { user: 'Fernando', pass: '123456' }
];

export default function SistemaRecuperacion() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [docs, setDocs] = useState([]);
  const [totalDocs, setTotalDocs] = useState(0);
  const [page, setPage] = useState(1);
  const [view, setView] = useState('dashboard'); // dashboard | list
  const [editingDoc, setEditingDoc] = useState(null);
  const [seguimientos, setSeguimientos] = useState([]);
  const [loginData, setLoginData] = useState({ user: '', pass: '' });

  // Filtros
  const [filters, setFilters] = useState({
    search: '', sede: '', estado: '', etapa: '', origen: '', responsable: ''
  });

  const ITEMS_PER_PAGE = 100;

  // --- LÓGICA DE AUTENTICACIÓN ---
  const handleLogin = (e) => {
    e.preventDefault();
    const valid = USUARIOS_AUTORIZADOS.find(u => u.user === loginData.user && u.pass === loginData.pass);
    if (valid) {
      setSession(valid.user);
      localStorage.setItem('user_session', valid.user);
    } else {
      alert('Usuario o contraseña incorrectos');
    }
  };

  const handleLogout = () => {
    setSession(null);
    localStorage.removeItem('user_session');
  };

  // --- CARGA DE DATOS ---
  const fetchDocs = useCallback(async () => {
    setLoading(true);
    let from = (page - 1) * ITEMS_PER_PAGE;
    let to = from + ITEMS_PER_PAGE - 1;

    let query = supabase.from('documentos').select('*', { count: 'exact' });

    if (filters.search) query = query.or(`cut.ilike.%${filters.search}%,documento.ilike.%${filters.search}%,remitente.ilike.%${filters.search}%`);
    if (filters.sede) query = query.eq('sede', filters.sede);
    if (filters.estado) query = query.eq('estado_final', filters.estado);
    if (filters.etapa) query = query.eq('etapa_actual', filters.etapa);
    if (filters.origen) query = query.eq('origen', filters.origen);

    const { data, count, error } = await query
      .order('fecha_registro', { ascending: false })
      .range(from, to);

    if (!error) {
      setDocs(data);
      setTotalDocs(count);
    }
    setLoading(false);
  }, [page, filters]);

  useEffect(() => {
    const savedUser = localStorage.getItem('user_session');
    if (savedUser) setSession(savedUser);
    fetchDocs();
  }, [fetchDocs]);

  // --- LÓGICA DE COLORES Y ESTADOS ---
  const getEstadoBadge = (doc) => {
    // REGLA: Si no está cargado al SISGED y pasó la etapa de verificación
    if (!doc.cargado_sisged && doc.etapa_actual !== 'VERIFICACION') {
      return { label: 'SEGUIMIENTO EN PROCESO', color: 'bg-orange-500' };
    }

    switch (doc.estado_final) {
      case 'RECUPERADO': return { label: 'RECUPERADO', color: 'bg-green-600' };
      case 'PENDIENTE': return { label: 'PENDIENTE', color: 'bg-red-600' };
      case 'RECONSTRUCCION': return { label: 'RECONSTRUCCION', color: 'bg-gray-500' };
      default: return { label: 'PENDIENTE', color: 'bg-red-600' };
    }
  };

  // --- IMPORTACIÓN EXCEL ---
  const importExcel = (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const bstr = evt.target.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

      const batch = data.slice(1).map(row => ({
        sede: row[0], cut: String(row[1]), documento: String(row[2]), remitente: row[3],
        fecha_registro: row[4], origen: row[5], procedimiento: row[6], celular: row[7],
        responsable_verificacion: row[8], fecha_verificacion: row[9],
        estado_visualizacion: row[11], observaciones: row[12],
        responsable_requerimiento: row[13], fecha_elaboracion: row[14],
        numero_documento: row[15], fecha_notificacion: row[16], medio_notificacion: row[17],
        fecha_remision: row[22], responsable_devolucion: row[23], fecha_devolucion: row[24],
        documento_cierre: row[25], oficina_destino: row[26],
        cargado_sisged: row[27] === 'SI', estado_final: row[28], observaciones_finales: row[29]
      }));

      const { error } = await supabase.from('documentos').upsert(batch, { onConflict: 'cut,documento' });
      if (error) alert("Error al importar: " + error.message);
      else { alert("Importación exitosa"); fetchDocs(); }
    };
    reader.readAsBinaryString(file);
  };

  // --- EXPORTACIÓN EXCEL ---
  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(docs);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reporte");
    XLSX.writeFile(wb, "Reporte_Documentos.xlsx");
  };

  // --- VISTA DE LOGIN ---
  if (!session) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md border-t-4 border-blue-600">
          <h1 className="text-2xl font-bold text-center text-slate-800 mb-2 uppercase">Sistema de Recuperación de Documentos</h1>
          <p className="text-center text-slate-500 mb-8">Ingrese sus credenciales para continuar</p>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Usuario</label>
              <input type="text" className="w-full p-3 border rounded-lg" placeholder="Ej: Yanina" 
                onChange={e => setLoginData({...loginData, user: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Contraseña</label>
              <input type="password" className="w-full p-3 border rounded-lg" placeholder="******" 
                onChange={e => setLoginData({...loginData, pass: e.target.value})} />
            </div>
            <button className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition">ENTRAR AL SISTEMA</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* SIDEBAR */}
      <div className="w-64 bg-slate-900 text-white flex flex-col">
        <div className="p-6 font-bold text-xl border-b border-slate-700 flex items-center gap-2">
          <FileText size={24} className="text-blue-400" /> SISGERED
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <button onClick={() => setView('dashboard')} className={`w-full flex items-center gap-3 p-3 rounded-lg ${view === 'dashboard' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}>
            <LayoutDashboard size={20} /> Dashboard
          </button>
          <button onClick={() => setView('list')} className={`w-full flex items-center gap-3 p-3 rounded-lg ${view === 'list' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}>
            <Search size={20} /> Documentos
          </button>
        </nav>
        <div className="p-4 border-t border-slate-700">
          <div className="flex items-center gap-3 mb-4 text-sm text-slate-300 px-2">
            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold">{session[0]}</div>
            {session}
          </div>
          <button onClick={handleLogout} className="w-full flex items-center gap-3 p-2 text-red-400 hover:bg-red-900/20 rounded-lg">
            <LogOut size={20} /> Cerrar Sesión
          </button>
        </div>
      </div>

      {/* CONTENIDO PRINCIPAL */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* HEADER / FILTROS */}
        <header className="bg-white border-b p-4 flex items-center justify-between shadow-sm">
          <div className="flex gap-4 flex-1 max-w-4xl">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 text-slate-400" size={18} />
              <input type="text" placeholder="Buscar por CUT, Documento o Remitente..." 
                className="w-full pl-10 pr-4 py-2 border rounded-lg bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none"
                onChange={e => setFilters({...filters, search: e.target.value})} />
            </div>
            <select className="border rounded-lg px-3 bg-slate-50" onChange={e => setFilters({...filters, sede: e.target.value})}>
              <option value="">Todas las Sedes</option>
              <option value="Sede Central">Sede Central</option>
              <option value="Sede Norte">Sede Norte</option>
            </select>
          </div>
          <div className="flex gap-2">
            <label className="cursor-pointer flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700">
              <Upload size={18} /> Importar
              <input type="file" className="hidden" accept=".xlsx, .xls" onChange={importExcel} />
            </label>
            <button onClick={exportExcel} className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-900">
              <Download size={18} /> Exportar
            </button>
          </div>
        </header>

        {/* ÁREA DE TRABAJO */}
        <main className="flex-1 overflow-auto p-6">
          {view === 'dashboard' ? (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-blue-500">
                <p className="text-slate-500 text-sm font-medium">Total Documentos</p>
                <h3 className="text-3xl font-bold">{totalDocs}</h3>
              </div>
              <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-green-500">
                <p className="text-slate-500 text-sm font-medium">Recuperados</p>
                <h3 className="text-3xl font-bold">{docs.filter(d => d.estado_final === 'RECUPERADO').length}</h3>
              </div>
              <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-orange-500">
                <p className="text-slate-500 text-sm font-medium">En Seguimiento</p>
                <h3 className="text-3xl font-bold">{docs.filter(d => !d.cargado_sisged && d.etapa_actual !== 'VERIFICACION').length}</h3>
              </div>
              <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-red-500">
                <p className="text-slate-500 text-sm font-medium">Pendientes</p>
                <h3 className="text-3xl font-bold">{docs.filter(d => d.estado_final === 'PENDIENTE').length}</h3>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm overflow-hidden border">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">CUT / Documento</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">Remitente / Sede</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">Etapa Actual</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">Estado</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {docs.map(doc => {
                    const status = getEstadoBadge(doc);
                    return (
                      <tr key={doc.id} className="hover:bg-slate-50 transition">
                        <td className="p-4">
                          <div className="font-bold text-blue-600">{doc.cut}</div>
                          <div className="text-sm text-slate-500">{doc.documento}</div>
                        </td>
                        <td className="p-4 text-sm">
                          <div className="text-slate-800">{doc.remitente}</div>
                          <div className="text-xs text-slate-500">{doc.sede}</div>
                        </td>
                        <td className="p-4">
                          <span className="bg-slate-200 text-slate-700 px-3 py-1 rounded-full text-xs font-bold">
                            {doc.etapa_actual}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className={`${status.color} text-white px-3 py-1 rounded-full text-xs font-bold shadow-sm`}>
                            {status.label}
                          </span>
                        </td>
                        <td className="p-4">
                          <button onClick={() => setEditingDoc(doc)} className="text-blue-600 hover:underline font-medium text-sm">Actualizar Registro</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {/* PAGINACIÓN */}
              <div className="p-4 border-t flex items-center justify-between bg-slate-50">
                <p className="text-sm text-slate-500">Mostrando {(page-1)*100 + 1} a {Math.min(page*100, totalDocs)} de {totalDocs} registros</p>
                <div className="flex gap-2">
                  <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="p-2 border rounded bg-white hover:bg-slate-100 disabled:opacity-50"><ChevronLeft size={20} /></button>
                  <span className="p-2 font-bold px-4">Página {page}</span>
                  <button disabled={page*ITEMS_PER_PAGE >= totalDocs} onClick={() => setPage(p => p + 1)} className="p-2 border rounded bg-white hover:bg-slate-100 disabled:opacity-50"><ChevronRight size={20} /></button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* MODAL DE EDICIÓN (POR ETAPAS) */}
      {editingDoc && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col">
            <div className="p-6 border-b flex justify-between items-center bg-slate-900 text-white rounded-t-2xl">
              <div>
                <h2 className="text-xl font-bold">Expediente: {editingDoc.cut}</h2>
                <p className="text-slate-400 text-sm">Gestionando: {editingDoc.documento}</p>
              </div>
              <button onClick={() => setEditingDoc(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            
            <div className="flex flex-1 overflow-hidden">
              {/* Tabs Izquierda */}
              <div className="w-64 border-r bg-slate-50 p-4 space-y-2">
                <button className="w-full text-left p-3 rounded-lg bg-blue-100 text-blue-700 font-bold border-l-4 border-blue-600">1. Verificación</button>
                <button className="w-full text-left p-3 rounded-lg hover:bg-white transition text-slate-600">2. Requerimiento</button>
                <button className="w-full text-left p-3 rounded-lg hover:bg-white transition text-slate-600">3. Seguimiento</button>
                <button className="w-full text-left p-3 rounded-lg hover:bg-white transition text-slate-600">4. Cierre / Recuperación</button>
              </div>

              {/* Formulario Derecha */}
              <div className="flex-1 overflow-auto p-8">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1 uppercase">Responsable de Verificación</label>
                    <select className="w-full p-3 border rounded-xl" value={editingDoc.responsable_verificacion || ''} onChange={e => setEditingDoc({...editingDoc, responsable_verificacion: e.target.value})}>
                      <option value="">Seleccione...</option>
                      {USUARIOS_AUTORIZADOS.map(u => <option key={u.user} value={u.user}>{u.user}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1 uppercase">Fecha Verificación</label>
                    <input type="date" className="w-full p-3 border rounded-xl" value={editingDoc.fecha_verificacion || ''} onChange={e => setEditingDoc({...editingDoc, fecha_verificacion: e.target.value})} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-bold text-slate-700 mb-1 uppercase">¿Se visualiza en el sistema?</label>
                    <div className="flex gap-4">
                      <button onClick={() => setEditingDoc({...editingDoc, estado_visualizacion: 'SI SE VISUALIZA'})} className={`flex-1 p-4 rounded-xl border-2 transition font-bold ${editingDoc.estado_visualizacion === 'SI SE VISUALIZA' ? 'border-green-600 bg-green-50 text-green-700' : 'border-slate-200'}`}>SÍ SE VISUALIZA</button>
                      <button onClick={() => setEditingDoc({...editingDoc, estado_visualizacion: 'NO SE VISUALIZA'})} className={`flex-1 p-4 rounded-xl border-2 transition font-bold ${editingDoc.estado_visualizacion === 'NO SE VISUALIZA' ? 'border-red-600 bg-red-50 text-red-700' : 'border-slate-200'}`}>NO SE VISUALIZA</button>
                    </div>
                  </div>
                  
                  <div className="col-span-2 p-6 bg-blue-50 rounded-xl border border-blue-100">
                    <h4 className="font-bold text-blue-800 mb-4 flex items-center gap-2"><CheckCircle2 size={20}/> SECCIÓN DE CIERRE (SISGED)</h4>
                    <div className="flex items-center gap-4 mb-4">
                      <input type="checkbox" id="sisged" className="w-6 h-6" checked={editingDoc.cargado_sisged} onChange={e => setEditingDoc({...editingDoc, cargado_sisged: e.target.checked})} />
                      <label htmlFor="sisged" className="font-bold text-slate-700">¿SE CARGÓ AL SISGED? (Marca para Recuperación Final)</label>
                    </div>
                    <label className="block text-sm font-bold text-slate-700 mb-1 uppercase">Estado Final</label>
                    <select className="w-full p-3 border rounded-xl" value={editingDoc.estado_final || 'PENDIENTE'} onChange={e => setEditingDoc({...editingDoc, estado_final: e.target.value})}>
                      <option value="PENDIENTE">PENDIENTE (ROJO)</option>
                      <option value="RECUPERADO">RECUPERADO (VERDE)</option>
                      <option value="RECONSTRUCCION">RECONSTRUCCION (GRIS)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 border-t bg-slate-50 flex justify-end gap-3">
              <button onClick={() => setEditingDoc(null)} className="px-6 py-3 font-bold text-slate-600">CANCELAR</button>
              <button onClick={async () => {
                const { error } = await supabase.from('documentos').update(editingDoc).eq('id', editingDoc.id);
                if (!error) { alert('Guardado con éxito'); setEditingDoc(null); fetchDocs(); }
              }} className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 flex items-center gap-2 shadow-lg">
                <Save size={20} /> GUARDAR CAMBIOS
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
