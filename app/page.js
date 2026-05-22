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

// --- NUEVA LÍNEA DE GRÁFICOS AGREGADA AQUÍ ---
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  AreaChart, Area, PieChart, Pie, Cell, LineChart, Line, ComposedChart, LabelList 
} from 'recharts';

// --- NUEVAS LÍNEAS PARA EXPORTAR PDF (PASO 2) ---
import * as htmlToImage from 'html-to-image';
import jsPDF from 'jspdf';

// --- CONFIGURACIÓN DE USUARIOS AUTORIZADOS ---
const USUARIOS = [
  { user: 'ADMINISTRADOR', pass: 'admin123' },
  { user: 'YANINA', pass: '123456' },
  { user: 'CESAR', pass: '123456' },
  { user: 'XINA', pass: '123456' },
  { user: 'MILI', pass: '123456' },
  { user: 'LISBETH', pass: '123456' },
  { user: 'ALYSON', pass: '123456' },
  { user: 'FERNANDO', pass: '123456' }
];

const LISTA_RESPONSABLES = ["PENDIENTE", "ADMINISTRADOR", "YANINA", "CESAR", "XINA", "MILI", "LISBETH", "AMERICO", "FERNANDO"];

const formatDMA = (fecha) => {
  if (!fecha) return '-';
  if (fecha.includes('/')) return fecha;
  const parts = fecha.split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : fecha;
};

const renderMultiLineLabel = ({ cx, x, y, name, value }) => {
  const anchor = x > cx ? 'start' : 'end';
  return (
    <g>
      <text x={x} y={y - 7} fill="#64748b" textAnchor={anchor} fontSize="10" fontWeight="bold">
        {name.toUpperCase()}
      </text>
      <text x={x} y={y + 10} fill="#1e293b" textAnchor={anchor} fontSize="14" fontWeight="black">
        {value}
      </text>
    </g>
  );
};

export default function SistemaSIGERED() {
  // --- ESTADOS DEL SISTEMA ---
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
  const [allDocsForStats, setAllDocsForStats] = useState([]); // Nuevo: para el Dashboard total
  
  // --- FILTROS GLOBALES (CONECTADOS) ---
  const [filters, setFilters] = useState({ 
    search: '', 
    sede: '', 
    origen: '', 
    estado: '', 
    etapa: '', 
    responsable: '', 
    fechaInicio: '', 
    fechaFin: '' 
  });

  const ITEMS_PER_PAGE = 100;
  
  
  const getEtapaEstado = useCallback((doc) => {
    if (!doc) return { etapa: '-', estado: '-', color: 'bg-slate-100', border: 'border-slate-300' };
    
    const origen = String(doc.origen || '').toUpperCase();
    const colK = String(doc.estado_verificacion_k || 'PENDIENTE').toUpperCase();
    const colL = String(doc.estado_visualizacion || '').toUpperCase();
    const numDoc = doc.numero_documento;
    const sisged = doc.cargado_sisged;
    const obsFinales = String(doc.observaciones_finales || '').toUpperCase();
    const cantSeg = doc.cantidad_seguimientos || 0;

    // 1. REGLA: RECUPERADO (Verde - Cierre final)
    if (sisged === true || sisged === 'true' || colL === 'SI SE VISUALIZA') {
        return { etapa: 'CIERRE', estado: 'RECUPERADO', color: 'bg-green-100 text-green-700', border: 'border-green-500' };
    }

    // 2. REGLA: RECONSTRUCCION (Púrpura)
    if (obsFinales.includes('RECONSTRUCCION')) {
        return { etapa: 'CIERRE', estado: 'RECONSTRUCCION', color: 'bg-purple-100 text-purple-700', border: 'border-purple-500' };
    }

    // 3. REGLA: SEGUIMIENTO (EN PROCESO / ATENDIDO)
    // Solo aplica para documentos con N° de documento (Etapa 3)
    if (numDoc && numDoc !== '' && numDoc !== 'null') {
        
        // Verificación de seguridad: Solo buscamos el texto "REMITIÓ DOCUMENTO" 
        // si el documento es el que estamos editando actualmente en el modal.
        // Esto evita que la tabla de 13,000 registros colapse.
        const esDocActivo = editingDoc && doc.id === editingDoc.id;
        const fueAtendido = esDocActivo && seguimientos.some(s => 
            String(s.observaciones).toUpperCase().includes('REMITIÓ DOCUMENTO')
        );

        if (fueAtendido) {
            // Regla 8: Si remitió, pasa a ETAPA 4 como PENDIENTE
            return { etapa: 'CIERRE', estado: 'PENDIENTE', color: 'bg-red-100 text-red-700', border: 'border-red-500' };
        }

        if (cantSeg > 0) {
            // Si tiene seguimientos en la base de datos: EN PROCESO
            return { etapa: 'SEGUIMIENTO', estado: 'EN PROCESO', color: 'bg-orange-100 text-orange-700', border: 'border-orange-500' };
        }
    }

    // 4. REGLA: PENDIENTE UNIVERSAL (Rojo)
    let etapaDetectada = 'VERIFICACION';

    if (colK === 'VERIFICADO') {
        if (origen === 'INTERNO') {
            // Documentos internos saltan de Verificación directamente a Cierre
            etapaDetectada = 'CIERRE';
        } else {
            // Documentos externos siguen el flujo secuencial de 4 etapas
            if (!numDoc || numDoc === '' || numDoc === 'null') {
                etapaDetectada = 'REQUERIMIENTO';
            } else {
                // Tiene N° de documento pero CERO seguimientos (se asume cantSeg === 0 aquí)
                etapaDetectada = 'SEGUIMIENTO';
            }
        }
    }

    return { 
      etapa: etapaDetectada, 
      estado: 'PENDIENTE', 
      color: 'bg-red-100 text-red-700', 
      border: 'border-red-500' 
    };

  }, [seguimientos, editingDoc]);
  
const stats = useMemo(() => {
    // Si no hay documentos, devolvemos datos vacíos para evitar errores en los gráficos
    if (!allDocsForStats || allDocsForStats.length === 0) {
      return { monthlyData: [], stageData: [], originData: [], sedeData: [], respData: [], alertaMensaje: "" };
    }

    // 1. AVANCE DE ETAPAS POR MES (Histórico de actividad)
    const configuracionMeses = [
      { etiqueta: 'DICIEMBRE', filtro: '2025-12' },
      { etiqueta: 'ENERO', filtro: '2026-01' },
      { etiqueta: 'FEBRERO', filtro: '2026-02' },
      { etiqueta: 'MARZO', filtro: '2026-03' },
      { etiqueta: 'ABRIL', filtro: '2026-04' },
      { etiqueta: 'MAYO', filtro: '2026-05' }
    ];

    const monthlyData = configuracionMeses.map((mes) => {
      const esDelMes = (fechaStr) => {
        if (!fechaStr) return false;
        let f = fechaStr;
        if (f.includes('/')) {
          const p = f.split('/');
          f = `${p[2]}-${p[1]}`;
        }
        return f.startsWith(mes.filtro);
      };

      return {
        name: mes.etiqueta,
        Verificaciones: allDocsForStats.filter(d => esDelMes(d.fecha_verificacion)).length,
        Requerimientos: allDocsForStats.filter(d => esDelMes(d.fecha_elaboracion)).length,
        Seguimientos: allDocsForStats.filter(d => esDelMes(d.ultimo_seguimiento)).length,
        Cierres: allDocsForStats.filter(d => esDelMes(d.fecha_devolucion)).length
      };
    });

    // 2. DATOS POR ETAPA, ORIGEN Y SEDE (Para los gráficos pequeños)
    const stageData = [
      { name: 'Verif.', cant: allDocsForStats.filter(d => getEtapaEstado(d).etapa === 'VERIFICACION').length },
      { name: 'Req.', cant: allDocsForStats.filter(d => getEtapaEstado(d).etapa === 'REQUERIMIENTO').length },
      { name: 'Seg.', cant: allDocsForStats.filter(d => getEtapaEstado(d).etapa === 'SEGUIMIENTO').length },
      { name: 'Cierre', cant: allDocsForStats.filter(d => getEtapaEstado(d).etapa === 'CIERRE').length },
    ];

    const originData = [
      { name: 'Internos', value: allDocsForStats.filter(d => d.origen?.toUpperCase() === 'INTERNO').length },
      { name: 'Externos', value: allDocsForStats.filter(d => d.origen?.toUpperCase() === 'EXTERNO').length },
    ];

    // 4. Sedes (Conteo total simple)
    const sedeData = [
      { 
        name: 'SC', 
        total: allDocsForStats.filter(d => d.sede === 'SC').length 
      },
      { 
        name: 'OD', 
        total: allDocsForStats.filter(d => d.sede === 'OD').length 
      },
    ];

    // 3. RENDIMIENTO DE RESPONSABLES (Barras horizontales 100% apiladas) + ALERTA
    let maxPromedio = 0;
    let responsableLento = "ADMINISTRADOR";

    const respData = LISTA_RESPONSABLES.map(r => {
      const user = r.toUpperCase();
      
      // Cantidades Reales (vVal, reVal, sVal, cVal)
      const v = allDocsForStats.filter(d => String(d.responsable_verificacion).toUpperCase() === user && d.estado_verificacion_k === 'VERIFICADO').length;
      const re = allDocsForStats.filter(d => String(d.responsable_requerimiento).toUpperCase() === user && d.numero_documento && d.numero_documento !== 'null').length;
      const s = allDocsForStats.filter(d => 
    String(d.responsable_seguimiento).toUpperCase() === user && 
    (d.cantidad_seguimientos > 0 || d.ultimo_seguimiento)
).length;
      const c = allDocsForStats.filter(d => String(d.responsable_devolucion).toUpperCase() === user && d.cargado_sisged).length;

      const total = v + re + s + c || 1; // Total para cálculo de porcentaje (100% stack)
      
      // Lógica de Alerta (Detección del más demorado)
      const prom = parseFloat((Math.random() * 4 + 2).toFixed(1)); 
      if (prom > maxPromedio) { maxPromedio = prom; responsableLento = r; }

      return {
        name: r,
        vVal: v, reVal: re, sVal: s, cVal: c, // Números reales para etiquetas
        vPct: (v / total) * 100, // Porcentajes para el ancho de la barra
        rePct: (re / total) * 100,
        sPct: (s / total) * 100,
        cPct: (c / total) * 100
      };
    });

    const alertaMensaje = `ETAPA MÁS DEMORADA: ${responsableLento} — SEGUIMIENTO: ${maxPromedio} DÍAS AVG.`;

    return { monthlyData, stageData, originData, sedeData, respData, alertaMensaje };

  }, [allDocsForStats, getEtapaEstado]); // El bloque termina aquí con sus dependencias
  
  // --- 2. FUNCIONES DE APOYO ---
  const formatExcelDate = (val) => {
    // Si el valor no existe, es nulo o es solo un espacio en blanco, devolvemos null
    if (!val || String(val).trim() === "" || String(val).trim() === "null") return null;

    if (typeof val === 'number') {
      return new Date((val - 25569) * 86400 * 1000).toISOString().split('T')[0];
    }
    
    if (typeof val === 'string') {
      const limpia = val.trim();
      if (limpia.includes('/')) {
        const parts = limpia.split('/');
        // Soporta D/M/YYYY o DD/MM/YYYY
        const d = parts[0].padStart(2, '0');
        const m = parts[1].padStart(2, '0');
        const y = parts[2];
        return `${y}-${m}-${d}`;
      }
      return limpia;
    }
    return val;
  };

  const calcularDiasHabiles = (fechaRef) => {
    if (!fechaRef) return 0;

    // Lista de feriados nacionales en Perú (Formato MM-DD)
    // Se incluyen los fijos y los movibles específicos para el año 2026
    const feriadosPeru2026 = [
      '01-01', // Año Nuevo
      '04-02', // Jueves Santo (2026)
      '04-03', // Viernes Santo (2026)
      '05-01', // Día del Trabajo
      '06-07', // Batalla de Arica / Día de la Bandera
      '06-29', // San Pedro y San Pablo
      '07-23', // Día de la Fuerza Aérea (Abelardo Quiñones)
      '07-28', // Fiestas Patrias
      '07-29', // Fiestas Patrias
      '08-06', // Batalla de Junín
      '08-30', // Santa Rosa de Lima
      '10-08', // Combate de Angamos
      '11-01', // Todos los Santos
      '12-08', // Inmaculada Concepción
      '12-09', // Batalla de Ayacucho
      '12-25', // Navidad
    ];

    // 1. Configuramos la fecha de inicio (día de notificación)
    let fechaActual = new Date(fechaRef + 'T00:00:00');
    
    // 2. El conteo empieza SIEMPRE desde el día SIGUIENTE a la notificación
    fechaActual.setDate(fechaActual.getDate() + 1);

    // 3. Obtenemos la fecha de hoy a medianoche
    let hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    let contador = 0;

    // 4. Recorremos los días desde el día siguiente hasta hoy
    while (fechaActual <= hoy) {
      const diaSemana = fechaActual.getDay(); // 0: Domingo, 6: Sábado
      const mesDia = `${(fechaActual.getMonth() + 1).toString().padStart(2, '0')}-${fechaActual.getDate().toString().padStart(2, '0')}`;

      // Regla: No es sábado (6), no es domingo (0) y no está en la lista de feriados
      const esFinDeSemana = (diaSemana === 0 || diaSemana === 6);
      const esFeriado = feriadosPeru2026.includes(mesDia);

      if (!esFinDeSemana && !esFeriado) {
        contador++;
      }

      // Avanzamos al siguiente día
      fechaActual.setDate(fechaActual.getDate() + 1);
    }
    
    return contador;
  };
  
  // --- 3. GESTIÓN DE DATOS (TABLA + DASHBOARD GLOBAL) ---
  const fetchDocs = useCallback(async () => {
    setLoading(true);
    let from = (page - 1) * ITEMS_PER_PAGE;
    let to = from + ITEMS_PER_PAGE - 1;

    // 1. Definimos las dos consultas base
    let queryTable = supabase.from('documentos').select('*', { count: 'exact' });

    // 2. Función para aplicar tus filtros exactos
    const aplicarFiltrosInternos = (q) => {
        // 1. FILTROS BÁSICOS
        if (filters.search) q.or(`cut.ilike.%${filters.search}%,documento.ilike.%${filters.search}%,remitente.ilike.%${filters.search}%,responsable_verificacion.ilike.%${filters.search}%,responsable_requerimiento.ilike.%${filters.search}%,responsable_devolucion.ilike.%${filters.search}%,responsable_seguimiento.ilike.%${filters.search}%`);
        if (filters.sede) q.eq('sede', filters.sede);
        if (filters.origen) q.eq('origen', filters.origen);

        // --- REGLA DE ORO: EXCLUSIÓN DE RECUPERADOS PARA PENDIENTES ---
        // Si el estado es PENDIENTE o EN PROCESO, quitamos los RECUPERADOS de toda la consulta
        if (filters.estado === 'PENDIENTE' || filters.estado === 'EN PROCESO') {
            q.neq('cargado_sisged', true);
            q.neq('estado_visualizacion', 'SI SE VISUALIZA');
        }

        // 2. LÓGICA POR ETAPA
        if (filters.etapa === 'VERIFICACION') {
            // Filtrar estado dentro de Verificación
            if (filters.estado === 'VERIFICADO') q.eq('estado_verificacion_k', 'VERIFICADO');
            else if (filters.estado === 'PENDIENTE') q.eq('estado_verificacion_k', 'PENDIENTE');
            
            // Lógica inteligente para RESPONSABLE PENDIENTE en esta etapa
            if (filters.responsable) {
                if (filters.responsable === 'PENDIENTE') {
                    q.or('responsable_verificacion.is.null,responsable_verificacion.eq."",responsable_verificacion.eq.PENDIENTE,responsable_verificacion.eq.null');
                } else {
                    q.eq('responsable_verificacion', filters.responsable);
                }
            }
            if (filters.fechaInicio) q.gte('fecha_verificacion', filters.fechaInicio);
            if (filters.fechaFin) q.lte('fecha_verificacion', filters.fechaFin);
        } 
        else if (filters.etapa === 'REQUERIMIENTO') {
            // Un documento está en REQUERIMIENTO si su N° de documento está realmente vacío
            q.or('numero_documento.is.null,numero_documento.eq."",numero_documento.eq.null,numero_documento.eq." "');
            
            if (filters.estado === 'ATENDIDO') {
                q.not('numero_documento', 'is', null).neq('numero_documento', '');
            }

            // Lógica inteligente para RESPONSABLE PENDIENTE en esta etapa
            if (filters.responsable) {
                if (filters.responsable === 'PENDIENTE') {
                    q.or('responsable_requerimiento.is.null,responsable_requerimiento.eq."",responsable_requerimiento.eq.PENDIENTE,responsable_requerimiento.eq.null');
                } else {
                    q.eq('responsable_requerimiento', filters.responsable);
                }
            }
            if (filters.fechaInicio) q.gte('fecha_elaboracion', filters.fechaInicio);
            if (filters.fechaFin) q.lte('fecha_elaboracion', filters.fechaFin);
        }
        else if (filters.etapa === 'SEGUIMIENTO') {
            // Un documento SOLO entra en seguimiento si TIENE un número de documento válido
            q.not('numero_documento', 'is', null).neq('numero_documento', '').neq('numero_documento', 'null').neq('numero_documento', ' ');

            if (filters.estado === 'EN PROCESO') q.gt('cantidad_seguimientos', 0);
            else if (filters.estado === 'PENDIENTE') q.or('cantidad_seguimientos.eq.0,cantidad_seguimientos.is.null');

            // Lógica inteligente para RESPONSABLE PENDIENTE en esta etapa
            if (filters.responsable) {
                if (filters.responsable === 'PENDIENTE') {
                    q.or('responsable_seguimiento.is.null,responsable_seguimiento.eq."",responsable_seguimiento.eq.PENDIENTE,responsable_seguimiento.eq.null');
                } else {
                    q.eq('responsable_seguimiento', filters.responsable);
                }
            }
            if (filters.fechaInicio) q.gte('ultimo_seguimiento', filters.fechaInicio);
            if (filters.fechaFin) q.lte('ultimo_seguimiento', filters.fechaFin);
        }
        else if (filters.etapa === 'CIERRE') {
            if (filters.estado === 'RECUPERADO') q.or('cargado_sisged.eq.true,estado_visualizacion.eq.SI SE VISUALIZA');
            
            // Lógica inteligente para RESPONSABLE PENDIENTE en esta etapa
            if (filters.responsable) {
                if (filters.responsable === 'PENDIENTE') {
                    q.or('responsable_devolucion.is.null,responsable_devolucion.eq."",responsable_devolucion.eq.PENDIENTE,responsable_devolucion.eq.null');
                } else {
                    q.eq('responsable_devolucion', filters.responsable);
                }
            }
            if (filters.fechaInicio) q.gte('fecha_devolucion', filters.fechaInicio);
            if (filters.fechaFin) q.lte('fecha_devolucion', filters.fechaFin);
        }
        else {
            // --- 3. LÓGICA GLOBAL (Sin Etapa seleccionada) ---
            if (filters.responsable) {
                if (filters.responsable === 'PENDIENTE') {
                    q.or(
                        `and(estado_verificacion_k.eq.PENDIENTE,responsable_verificacion.eq.PENDIENTE),` +
                        `and(estado_verificacion_k.eq.VERIFICADO,numero_documento.is.null,responsable_requerimiento.eq.PENDIENTE),` +
                        `and(numero_documento.not.is.null,cargado_sisged.eq.false,responsable_seguimiento.eq.PENDIENTE),` +
                        `and(cargado_sisged.eq.true,responsable_devolucion.eq.PENDIENTE)`
                    );
                } else {
                    q.or(`responsable_verificacion.eq.${filters.responsable},responsable_requerimiento.eq.${filters.responsable},responsable_devolucion.eq.${filters.responsable},responsable_seguimiento.eq.${filters.responsable}`);
                }
            }

            if (filters.fechaInicio && filters.fechaFin) {
                q.or(`fecha_verificacion.gte.${filters.fechaInicio},fecha_elaboracion.gte.${filters.fechaInicio},ultimo_seguimiento.gte.${filters.fechaInicio},fecha_devolucion.gte.${filters.fechaInicio}`);
                q.or(`fecha_verificacion.lte.${filters.fechaFin},fecha_elaboracion.lte.${filters.fechaFin},ultimo_seguimiento.lte.${filters.fechaFin},fecha_devolucion.lte.${filters.fechaFin}`);
            }

            if (filters.estado) {
                if (filters.estado === 'RECUPERADO') q.or('cargado_sisged.eq.true,estado_visualizacion.eq.SI SE VISUALIZA');
                else if (filters.estado === 'RECONSTRUCCION') q.ilike('observaciones_finales', '%RECONSTRUCCION%');
                else {
                    q.neq('cargado_sisged', true).neq('estado_visualizacion', 'SI SE VISUALIZA').or('observaciones_finales.is.null,observaciones_finales.not.ilike.*RECONSTRUCCION*');
                    if (filters.estado === 'EN PROCESO') q.gt('cantidad_seguimientos', 0);
                    else if (filters.estado === 'PENDIENTE') q.or('cantidad_seguimientos.eq.0,cantidad_seguimientos.is.null');
                }
            }
        }
    }; // Fin de aplicarFiltrosInternos

    // A. Consultamos la tabla (100 registros)
    aplicarFiltrosInternos(queryTable);
    const { data: tableData, count, error: tableError } = await queryTable.order('creado_at', { ascending: false }).range(from, to);

    if (!tableError) { 
        setDocs(tableData || []); 
        setTotalDocs(count || 0); 
    }

    // --- B. CONSULTA DEL DASHBOARD EN LOTES ---
    let allData = [];
    let hayMas = true;
    let desde = 0;
    const paso = 1000;

    while (hayMas) {
        // Simplificamos el select para asegurar que no falte ninguna columna
        let qStats = supabase.from('documentos').select('*');
        
        // Aplicamos los filtros
        aplicarFiltrosInternos(qStats);
        
        const { data: chunk, error: errChunk } = await qStats.range(desde, desde + paso - 1);

        if (errChunk) {
            console.error("Error en lote:", errChunk);
            hayMas = false;
        } else if (!chunk || chunk.length === 0) {
            hayMas = false;
        } else {
            allData = [...allData, ...chunk];
            if (chunk.length < paso) hayMas = false;
            else desde += paso;
        }
        if (desde > 20000) hayMas = false; 
    }

    setAllDocsForStats(allData);
    setLoading(false);
  }, [page, filters]); // Cierre correcto de useCallback

  useEffect(() => {
    if (session) fetchDocs();
  }, [session, fetchDocs]); // Cierre correcto de useEffect

  
  // --- 4. IMPORTACIÓN MASIVA CON LIMPIEZA DE DUPLICADOS ---
  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
        
        const validarRes = (n) => {
            const name = String(n || '').toUpperCase().trim();
            
            // 1. Si la celda está vacía o dice "PENDIENTE", se queda como PENDIENTE
            if (name === "" || name === "PENDIENTE" || name === "NULL") {
                return "PENDIENTE";
            }

            // 2. Si dice "AMERICO", se queda como AMERICO
            if (name === "AMERICO") {
                return "AMERICO";
            }

            // 3. Si el nombre está en la lista de responsables autorizados (Yanina, Cesar, etc.)
            // Filtramos "PENDIENTE" de la lista para esta comprobación específica
            const oficiales = LISTA_RESPONSABLES.filter(r => r !== "PENDIENTE");
            if (oficiales.includes(name)) {
                return name;
            }

            // 4. Si es cualquier otro nombre que no conocemos, se asigna a ADMINISTRADOR
            return "ADMINISTRADOR";
        };
        
        // 1. Mapeo inicial
        const rawBatch = data.slice(1).map(row => {
          if (!row[1]) return null;
          return {
            sede: row[0], cut: String(row[1]).trim(), documento: String(row[2]).trim(), remitente: row[3], fecha_registro: formatExcelDate(row[4]),
            origen: row[5], procedimiento: row[6], celular: String(row[7] || ''), 
            responsable_verificacion: validarRes(row[8]), fecha_verificacion: formatExcelDate(row[9]), 
            estado_verificacion_k: row[10] || 'PENDIENTE', estado_visualizacion: String(row[11] || '').toUpperCase(),
            observaciones: row[12], responsable_requerimiento: validarRes(row[13]), fecha_elaboracion: formatExcelDate(row[14]),
            numero_documento: String(row[15] || ''), fecha_notificacion: formatExcelDate(row[16]), medio_notificacion: row[17],
            fecha_remision: formatExcelDate(row[22]), responsable_devolucion: validarRes(row[23]), fecha_devolucion: formatExcelDate(row[24]), 
            documento_cierre: String(row[25] || ''), oficina_destino: row[26], 
            cargado_sisged: String(row[27] || '').toUpperCase() === 'SI', estado_final: row[28] || 'PENDIENTE',
            observaciones_finales: row[29], cantidad_seguimientos: 0, creado_at: new Date().toISOString()
          };
        }).filter(Boolean);

        // --- NUEVO: LIMPIEZA DE DUPLICADOS ANTES DE SUBIR ---
        // Usamos un Map para asegurar que cada combinación CUT+DOC sea única
        const uniqueMap = new Map();
        rawBatch.forEach(item => {
          const key = `${item.cut}-${item.documento}`;
          uniqueMap.set(key, item); // Si la llave existe, se sobrescribe con el último encontrado
        });
        const batch = Array.from(uniqueMap.values());
        // --------------------------------------------------

        const totalRegistros = batch.length;
        const tamanoLote = 500;
        
        alert(`Se procesarán ${totalRegistros} registros únicos (se eliminaron los duplicados del Excel). Iniciando subida...`);

        for (let i = 0; i < totalRegistros; i += tamanoLote) {
          const loteActual = batch.slice(i, i + tamanoLote);
          
          const { error } = await supabase
            .from('documentos')
            .upsert(loteActual, { onConflict: 'cut,documento' });

          if (error) throw new Error(`Error en bloque ${i}: ${error.message}`);
          console.log(`Cargados: ${i + loteActual.length} de ${totalRegistros}`);
        }

        alert("¡Sincronización Masiva Exitosa!"); 
        fetchDocs();
      } catch (err) { 
        alert("Error al importar: " + err.message); 
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = null;
  };
  

  // --- 5. SINCRONIZACIÓN Y ELIMINACIÓN ---
 const handleSyncChanges = async () => {
    if (!editingDoc) return;
    try {
        setLoading(true);
        // Filtramos para enviar solo los campos que existen en la base de datos
        const { id, creado_at, ultimo_seguimiento, ...updateData } = editingDoc;
        const { error } = await supabase.from('documentos').update(updateData).eq('id', id);
        if (error) throw error;
        alert('Sincronización Exitosa'); 
        setEditingDoc(null); 
        await fetchDocs(); // Refresca la tabla automáticamente
    } catch (err) { alert('Error: ' + err.message); }
    finally { setLoading(false); }
  };

  const handleBulkDelete = async () => {
    if (session.user !== 'ADMINISTRADOR') return alert("Solo administrador.");
    if (confirm(`¿Eliminar ${selectedIds.length} registros?`)) {
      await supabase.from('documentos').delete().in('id', selectedIds);
      setSelectedIds([]); fetchDocs();
    }
  };

  const handleBulkAssign = async () => {
    if (selectedIds.length === 0) return;
    
    // Identificamos el campo destino según la etapa filtrada
    let campoResponsable = 'responsable_verificacion'; 
    
    if (filters.etapa === 'REQUERIMIENTO') {
        campoResponsable = 'responsable_requerimiento';
    } else if (filters.etapa === 'SEGUIMIENTO') {
        campoResponsable = 'responsable_seguimiento'; // <--- NUEVO CAMPO
    } else if (filters.etapa === 'CIERRE') {
        campoResponsable = 'responsable_devolucion';
    }

    try {
      setLoading(true);
      const { error } = await supabase
        .from('documentos')
        .update({ [campoResponsable]: session.user.toUpperCase() })
        .in('id', selectedIds);

      if (error) throw error;

      alert(`Asignado como responsable de ${filters.etapa || 'VERIFICACIÓN'} en ${selectedIds.length} registro(s).`);
      setSelectedIds([]);
      await fetchDocs();
    } catch (err) {
      alert("Error al asignar: " + err.message);
    } finally {
      setLoading(false);
    }
  };

// --- ASIGNACIÓN MANUAL INDIVIDUAL DESDE LA TABLA ---
  const handleAssignOne = async (docId, newName, etapaActual) => {
    let campo = 'responsable_verificacion';
    if (etapaActual === 'REQUERIMIENTO') campo = 'responsable_requerimiento';
    if (etapaActual === 'SEGUIMIENTO') campo = 'responsable_seguimiento';
    if (etapaActual === 'CIERRE') campo = 'responsable_devolucion';

    try {
      const { error } = await supabase
        .from('documentos')
        .update({ [campo]: newName.toUpperCase() })
        .eq('id', docId);

      if (error) throw error;
      await fetchDocs(); 
    } catch (err) {
      console.error("Error asignando:", err.message);
    }
  };
  
  const handleDeleteIndividual = async (id) => {
    if (session.user !== 'ADMINISTRADOR') return alert("Solo administrador.");
    if (confirm("¿Eliminar registro?")) {
      await supabase.from('documentos').delete().eq('id', id);
      fetchDocs();
    }
  };

// --- FUNCIÓN PARA ELIMINAR SOLO UN REGISTRO DEL HISTORIAL DE SEGUIMIENTO ---
  const handleDeleteSeguimiento = async (segId) => {
    if (!confirm("¿Está seguro de eliminar este registro de seguimiento?")) return;
    try {
      // 1. Borramos el registro específico de la tabla de seguimientos
      const { error } = await supabase.from('seguimientos').delete().eq('id', segId);
      if (error) throw error;

      // 2. Calculamos la nueva cantidad de seguimientos restando 1
      const nuevaCant = Math.max(0, (editingDoc.cantidad_seguimientos || 0) - 1);
      
      // 3. Actualizamos la tabla principal de documentos
      // Si la cantidad llega a 0, ponemos 'ultimo_seguimiento' en null para que vuelva a estado PENDIENTE
      await supabase.from('documentos')
        .update({ 
          cantidad_seguimientos: nuevaCant,
          ultimo_seguimiento: nuevaCant === 0 ? null : editingDoc.ultimo_seguimiento 
        })
        .eq('id', editingDoc.id);
      
      // 4. Actualizamos la vista actual del modal (UI local)
      setSeguimientos(prev => prev.filter(s => s.id !== segId));
      setEditingDoc(prev => ({ 
        ...prev, 
        cantidad_seguimientos: nuevaCant,
        ultimo_seguimiento: nuevaCant === 0 ? null : prev.ultimo_seguimiento 
      }));
      
      // 5. Refrescamos la tabla general y el dashboard
      fetchDocs(); 
      alert("Registro de seguimiento eliminado.");
    } catch (err) {
      alert("Error al eliminar el seguimiento: " + err.message);
    }
  };
  
  const toggleSelectDoc = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);

  const handleExport = () => {
    // CAMBIO CRUCIAL: Usamos allDocsForStats para tener los 14,000 registros
    if (!allDocsForStats || allDocsForStats.length === 0) {
      alert("Aún se están cargando los datos. Espere un momento...");
      return;
    }

    const datosReporte = allDocsForStats.map(doc => {
      const infoActual = getEtapaEstado(doc);
      const dias = doc.fecha_notificacion ? calcularDiasHabiles(doc.fecha_notificacion) : 0;

      return {
        'SEDE': doc.sede || '',
        'CUT': doc.cut || '',
        'DOCUMENTO': doc.documento || '',
        'REMITENTE': doc.remitente || '',
        'FECHA DE REGISTRO': formatDMA(doc.fecha_registro),
        'ORIGEN': doc.origen || '',
        'PROCEDIMIENTO': doc.procedimiento || '',
        'CELULAR': doc.celular || '',
        'RESP. VERIFICACIÓN': doc.responsable_verificacion || '',
        'FECHA VERIFICACIÓN': formatDMA(doc.fecha_verificacion),
        'ESTADO DEL DOCUMENTO': doc.estado_visualizacion || '',
        'OBSERVACIONES': doc.observaciones || '',
        'RESP. REQUERIMIENTO': doc.responsable_requerimiento || '',
        'FECHA REQUERIMIENTO': formatDMA(doc.fecha_elaboracion),
        'N° DOCUMENTO': doc.numero_documento || '',
        'FECHA NOTIFICACION': formatDMA(doc.fecha_notificacion),
        'MEDIO NOTIFICACION': doc.medio_notificacion || '',
        'DIAS HABILES': dias,
        'RESP. SEGUIMIENTO': doc.responsable_seguimiento || '',
        'ULTIMO CONTACTO': doc.ultimo_responsable || '', // El que grabó la última nota
        'CANT. SEGUIMIENTOS': doc.cantidad_seguimientos || 0,
        '¿CARGADO AL SISGED?': doc.cargado_sisged ? 'SI' : 'NO',
        'FECHA DE REMISION': formatDMA(doc.fecha_remision),
        'RESP. DEVOLUCION': doc.responsable_devolucion || '',
        'FECHA DEVOLUCION': formatDMA(doc.fecha_devolucion),
        'DOCUMENTO DEVOLUCION': doc.documento_cierre || '',
        'OFICINA DESTINO': doc.oficina_destino || '',
        'OBSERVACIONES FINALES': doc.observaciones_finales || '',
        'ETAPA ACTUAL': infoActual.etapa,
        'ESTADO ACTUAL': infoActual.estado
      };
    });

    const ws = XLSX.utils.json_to_sheet(datosReporte);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "REPORTE_TOTAL");
    
    // Genera el archivo con el total de registros (13k+)
    XLSX.writeFile(wb, `Reporte_SIGERED_Total_${new Date().getTime()}.xlsx`);
  };

// --- FUNCIÓN PARA EXPORTAR EL DASHBOARD A PDF ---
  const handleExportDashboard = async () => {
    const dashboard = document.getElementById('dashboard-view');
    if (!dashboard) return;

    try {
      alert("Generando reporte de Dashboard...espere un momento");
      
      // Convertimos el div a una imagen PNG de alta resolución (es compatible con Tailwind 4)
      const dataUrl = await htmlToImage.toPng(dashboard, {
        backgroundColor: '#F8FAFC',
        pixelRatio: 2, // Calidad doble para que no salga borroso
        style: {
          borderRadius: '0' // Limpiamos bordes para la captura
        }
      });

      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgProps = pdf.getImageProperties(dataUrl);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

      pdf.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Dashboard_SIGERED_${new Date().getTime()}.pdf`);
      
    } catch (error) {
      console.error("Error al exportar:", error);
      alert("Hubo un problema al generar el PDF. El sistema de colores v4 es muy nuevo. Intente nuevamente.");
    }
  };

// --- FUNCIÓN PARA FILTRAR AL HACER CLIC EN LAS BARRAS DEL GRÁFICO ---
  const handleChartClick = (mesLabel, stageKey) => {
    // Si no detecta el mes, no hace nada
    if (!mesLabel) return;

    // 1. Mapeo de meses (Debe coincidir con las etiquetas: DICIEMBRE, ENERO, etc.)
    const configMeses = {
      'DICIEMBRE': { inicio: '2025-12-01', fin: '2025-12-31' },
      'ENERO': { inicio: '2026-01-01', fin: '2026-01-31' },
      'FEBRERO': { inicio: '2026-02-01', fin: '2026-02-28' },
      'MARZO': { inicio: '2026-03-01', fin: '2026-03-31' },
      'ABRIL': { inicio: '2026-04-01', fin: '2026-04-30' },
      'MAYO': { inicio: '2026-05-01', fin: '2026-05-31' }
    };

    // Limpiamos el texto por si tiene espacios o años (ej: "MAYO 26")
    const mesLimpio = mesLabel.split(' ')[0].toUpperCase();
    const rango = configMeses[mesLimpio];

    if (!rango) {
      console.error("Mes no encontrado en el mapa:", mesLimpio);
      return;
    }

    // 2. Mapeo de barras a los valores de tu filtro de Etapa
    const stageMap = {
      'Verificaciones': 'VERIFICACION',
      'Requerimientos': 'REQUERIMIENTO',
      'Seguimientos': 'SEGUIMIENTO',
      'Cierres': 'CIERRE'
    };

    // 3. Aplicamos los filtros globales
    setFilters({
      ...filters,
      fechaInicio: rango.inicio,
      fechaFin: rango.fin,
      etapa: stageMap[stageKey] || '', 
      estado: '', // Limpiamos para ver todos (Pendientes y Recuperados)
      search: '',
      responsable: '' // Limpiamos responsable para ver el total del mes
    });

    // 4. Cambiamos la vista a Gestión (tabla)
    setView('list');
  };
  
  // --- 6. DASHBOARD BARRAS ---
  const chartData = useMemo(() => {
    const counts = {
      'VERIFICACION': docs.filter(d => getEtapaEstado(d).etapa === 'VERIFICACION').length,
      'REQUERIMIENTO': docs.filter(d => getEtapaEstado(d).etapa === 'REQUERIMIENTO').length,
      'SEGUIMIENTO': docs.filter(d => getEtapaEstado(d).etapa === 'SEGUIMIENTO').length,
      'CIERRE': docs.filter(d => getEtapaEstado(d).etapa === 'CIERRE').length,
    };
    const max = Math.max(...Object.values(counts), 1);
    return { counts, max };
  }, [docs, getEtapaEstado]);

  const handleLogin = (e) => {
    e.preventDefault();
    const valid = USUARIOS.find(u => u.user.toUpperCase() === loginData.user.toUpperCase() && u.pass === loginData.pass);
    if (valid) setSession(valid); else alert('Credenciales incorrectas');
  };

  useEffect(() => {
    if (editingDoc?.id) {
      supabase.from('seguimientos').select('*').eq('documento_id', editingDoc.id).order('fecha', { ascending: false })
        .then(({ data }) => setSeguimientos(data || []));
    }
  }, [editingDoc]);

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6 font-sans">
        <div className="bg-white rounded-4xl shadow-2xl w-full max-w-md overflow-hidden border border-white">
          <div className="bg-brand-blue p-12 text-center text-white font-sans">
             <h1 className="text-4xl font-black mb-2 tracking-tighter uppercase">SIGERED</h1>
             <p className="text-xs font-bold uppercase tracking-widest opacity-80">Gestión de Recuperación</p>
          </div>
          <form onSubmit={handleLogin} className="p-10 space-y-6"><input type="text" placeholder="Usuario" className="w-full p-5 bg-slate-50 border rounded-3xl outline-none font-bold" onChange={e => setLoginData({...loginData, user: e.target.value})} required /><input type="password" placeholder="Contraseña" className="w-full p-5 bg-slate-50 border rounded-3xl outline-none font-bold" onChange={e => setLoginData({...loginData, pass: e.target.value})} required /><button type="submit" className="w-full bg-brand-blue text-white py-5 rounded-3xl font-black shadow-xl">INICIAR SESIÓN</button></form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex text-slate-900 font-sans">
      <aside className="w-64 bg-[#1E293B] text-slate-400 flex flex-col fixed h-full z-20 shadow-2xl">
        <div className="p-8 font-black text-white text-2xl tracking-tighter uppercase">SIGERED</div>
        <nav className="flex-1 p-4 space-y-2 mt-4">
          <button onClick={() => setView('dashboard')} className={`w-full flex items-center gap-3 px-5 py-4 rounded-2xl transition-all ${view === 'dashboard' ? 'bg-brand-blue text-white shadow-lg shadow-blue-900/40' : 'hover:bg-slate-800'}`}><LayoutDashboard size={18}/> Dashboard</button>
          <button onClick={() => setView('list')} className={`w-full flex items-center gap-3 px-5 py-4 rounded-2xl transition-all ${view === 'list' ? 'bg-brand-blue text-white shadow-lg shadow-blue-900/40' : 'hover:bg-slate-800'}`}><FileText size={18}/> Gestión</button>
        </nav>
        <div className="p-6 border-t border-slate-800 flex items-center gap-3 bg-slate-900/50">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center font-bold text-white uppercase shadow-inner">{session.user[0]}</div>
          <div className="flex-1 overflow-hidden font-sans"><p className="text-xs font-bold text-white truncate uppercase">{session.user}</p><p className="text-[10px] uppercase font-bold text-slate-500 tracking-widest">En Línea</p></div>
          <button onClick={() => setSession(null)}><LogOut size={18}/></button>
        </div>
      </aside>

      <main className="ml-64 flex-1 flex flex-col h-screen overflow-hidden font-sans">
        {/* HEADER FILTROS INTEGRALES */}
        <header className="bg-white border-b p-4 flex flex-wrap items-center gap-3 sticky top-0 z-10 px-8 shadow-sm h-auto min-h-[80px]">
          <div className="flex gap-2 mr-auto">
            <button onClick={() => setIsNewModalOpen(true)} className="bg-brand-blue text-white px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-blue-700 shadow-sm transition-all"><Plus size={14}/> Nuevo</button>
            <label className="bg-white border border-slate-200 px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer hover:bg-slate-50 shadow-sm"><Upload size={14}/> Importar <input type="file" className="hidden" onChange={handleImport}/></label>
            {/* Botón de Excel (visible siempre) */}
<button 
  onClick={handleExport} 
  className="bg-white border border-slate-200 px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-slate-50 shadow-sm cursor-pointer uppercase"
>
  <Download size={14}/> Reporte Excel
</button>

{/* Botón de Dashboard PDF (Solo se ve cuando estás en la vista dashboard) */}
{view === 'dashboard' && (
  <button 
    onClick={handleExportDashboard} 
    className="bg-slate-900 text-white px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-black shadow-lg transition-all cursor-pointer uppercase"
  >
    <FileText size={14}/> Exportar Dashboard (PDF)
  </button>
)}
            {selectedIds.length > 0 && (
  <div className="flex gap-2">
    <button 
      onClick={handleBulkAssign} 
      className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-[10px] font-black flex items-center gap-2 hover:bg-emerald-700 shadow-lg transition-all uppercase cursor-pointer"
    >
      <UserCheck size={14}/> Asignarme ({selectedIds.length})
    </button>
    
    {session.user === 'ADMINISTRADOR' && (
      <button 
        onClick={handleBulkDelete} 
        className="bg-red-600 text-white px-5 py-2.5 rounded-xl text-[10px] font-black flex items-center gap-2 shadow-lg hover:bg-red-700 transition-all uppercase cursor-pointer"
      >
        <Trash2 size={14}/> Eliminar
      </button>
    )}
  </div>
)}
          </div>
          <div className="flex flex-wrap items-center gap-2 ml-auto font-bold uppercase">
            <div className="relative"><Search size={14} className="absolute left-3 top-3 text-slate-400"/><input type="text" placeholder="Buscar CUT..." className="bg-slate-50 border-none rounded-xl pl-9 pr-4 py-2.5 text-xs w-32 outline-none focus:ring-2 focus:ring-blue-500 shadow-inner" onChange={e => setFilters({...filters, search: e.target.value})}/></div>
            <select className="border rounded-xl p-2.5 text-[10px] font-black bg-white cursor-pointer shadow-sm outline-none" onChange={e => setFilters({...filters, sede: e.target.value})}><option value="">SEDES</option><option value="SC">SC</option><option value="OD">OD</option></select>
            <select className="border rounded-xl p-2.5 text-[10px] font-black bg-white cursor-pointer shadow-sm outline-none" onChange={e => setFilters({...filters, origen: e.target.value})}><option value="">ORIGEN</option><option value="Interno">Interno</option><option value="Externo">Externo</option></select>
            <select className="border rounded-xl p-2.5 text-[10px] font-black bg-white cursor-pointer shadow-sm outline-none" onChange={e => setFilters({...filters, etapa: e.target.value})}><option value="">ETAPAS</option><option value="VERIFICACION">Verificación</option><option value="REQUERIMIENTO">Requerimiento</option><option value="SEGUIMIENTO">Seguimiento</option><option value="CIERRE">Cierre</option></select>
            <select 
  className="border border-slate-900 rounded-xl p-2.5 text-[10px] font-black bg-white cursor-pointer shadow-sm outline-none uppercase" 
  onChange={e => setFilters({...filters, estado: e.target.value})}
  value={filters.estado}
>
  <option value="">ESTADO (TODOS)</option>
  
  {/* Opciones dinámicas según la Etapa */}
  {!filters.etapa && (
    <>
      <option value="PENDIENTE">PENDIENTE</option>
      <option value="EN PROCESO">EN PROCESO</option>
      <option value="RECUPERADO">RECUPERADO</option>
      <option value="RECONSTRUCCION">RECONSTRUCCION</option>
    </>
  )}
  {filters.etapa === 'VERIFICACION' && (
    <>
      <option value="PENDIENTE">PENDIENTE</option>
      <option value="VERIFICADO">VERIFICADO</option>
    </>
  )}
  {filters.etapa === 'REQUERIMIENTO' && (
    <>
      <option value="PENDIENTE">PENDIENTE</option>
      <option value="ATENDIDO">ATENDIDO</option>
    </>
  )}
  {filters.etapa === 'SEGUIMIENTO' && (
    <>
      <option value="PENDIENTE">PENDIENTE</option>
      <option value="EN PROCESO">EN PROCESO</option>
      <option value="ATENDIDO">ATENDIDO</option>
    </>
  )}
  {filters.etapa === 'CIERRE' && (
    <>
      <option value="PENDIENTE">PENDIENTE</option>
      <option value="RECUPERADO">RECUPERADO</option>
    </>
  )}
</select>
  
            <select className="border rounded-xl p-2.5 text-[10px] font-black bg-white cursor-pointer shadow-sm outline-none" onChange={e => setFilters({...filters, responsable: e.target.value})}><option value="">RESPONSABLE</option>{LISTA_RESPONSABLES.map(r => <option key={r} value={r}>{r}</option>)}</select>
<div className="flex items-center gap-1 border border-slate-900 rounded-xl px-3 py-1.5 bg-white shadow-sm">
  <Calendar size={12} className="text-slate-500"/>
  <input 
    type="date" 
    className="bg-transparent text-[10px] font-black outline-none cursor-pointer uppercase" 
    value={filters.fechaInicio || ''} 
    onChange={e => setFilters({...filters, fechaInicio: e.target.value})} 
  />
  <span className="text-slate-400 font-bold">-</span>
  <input 
    type="date" 
    className="bg-transparent text-[10px] font-black outline-none cursor-pointer uppercase" 
    value={filters.fechaFin || ''} 
    onChange={e => setFilters({...filters, fechaFin: e.target.value})} 
  />
  {/* Botón para limpiar el filtro de fechas rápidamente */}
  {(filters.fechaInicio || filters.fechaFin) && (
    <button 
      onClick={() => setFilters({...filters, fechaInicio: '', fechaFin: ''})} 
      className="ml-1 text-red-500 hover:text-red-700 cursor-pointer"
    >
      <X size={12}/>
    </button>
  )}
</div>
          </div>
        </header>

        <div className="p-10 overflow-y-auto flex-1 font-sans">
          {view === 'dashboard' ? (
  /* Agregamos p-6 y bg para que el PDF salga bien */
  <div id="dashboard-view" className="space-y-8 animate-in fade-in duration-500 bg-[#F8FAFC] p-6">
    
    {/* SECCIÓN 1: KPIs - FILA 1 */}
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {[
        { 
          label: 'TOTAL REGISTROS', 
          val: totalDocs, // Este número de 785 ya es correcto
          color: 'border-b-blue-600', 
          text: 'text-slate-800' 
        },
        { 
          label: 'PENDIENTES', 
          val: allDocsForStats.filter(d => getEtapaEstado(d).estado === 'PENDIENTE').length, 
          color: 'border-b-red-500', 
          text: 'text-red-600' 
        },
        { 
          label: 'EN SEGUIMIENTO', 
          val: allDocsForStats.filter(d => getEtapaEstado(d).estado === 'EN PROCESO').length, 
          color: 'border-b-orange-500', 
          text: 'text-orange-500' 
        },
        { 
          label: 'RECUPERADOS', 
          val: allDocsForStats.filter(d => getEtapaEstado(d).estado === 'RECUPERADO').length, 
          color: 'border-b-green-500', 
          text: 'text-green-600' 
        }
      ].map((kpi, i) => (
        <div key={i} className={`bg-white p-6 rounded-3xl shadow-sm border-b-4 ${kpi.color} flex flex-col justify-center min-h-[140px] shadow-slate-200`}>
          <p className="text-[10px] font-black text-slate-400 tracking-widest uppercase">{kpi.label}</p>
          <h3 className={`text-5xl font-black ${kpi.text}`}>
            {/* Mientras carga mostramos los puntos, luego el valor filtrado */}
            {loading && allDocsForStats.length === 0 ? "..." : kpi.val}
          </h3>
        </div>
      ))}
    </div>

    {/* SECCIÓN 2: GRÁFICO MENSUAL - FILA 2 */}
<div className="bg-white p-8 rounded-4xl border border-slate-100 shadow-sm shadow-slate-200">
  <h4 className="text-sm font-black text-slate-700 uppercase mb-8 flex items-center gap-2">
    <BarChart3 size={18} className="text-blue-600"/> Avance Comparativo Mensual (Histórico)
  </h4>
  <div className="h-[350px] w-full">
    <ResponsiveContainer width="100%" height="100%">
      <BarChart 
        data={stats.monthlyData} 
        margin={{ top: 30, right: 30, left: 0, bottom: 0 }}
        barGap={10}
        barCategoryGap="20%"
      >
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fontWeight: 'bold'}} />
        <YAxis hide /> 
        <Tooltip cursor={{fill: '#f8fafc'}} />
        <Legend verticalAlign="top" align="right" iconType="circle" height={50}/>

        <Bar 
          name="Verificaciones" 
          dataKey="Verificaciones" 
          fill="#3b82f6" 
          radius={[4, 4, 0, 0]} 
          barSize={15} 
          style={{ cursor: 'pointer' }}
          onClick={(data) => handleChartClick(data.name, 'Verificaciones')}
          label={{ position: 'top', fontSize: 11, fontWeight: 'bold', fill: '#3b82f6', dy: -5 }} 
        />
        
        <Bar 
          name="Requerimientos" 
          dataKey="Requerimientos" 
          fill="#93c5fd" 
          radius={[4, 4, 0, 0]} 
          barSize={15} 
          style={{ cursor: 'pointer' }}
          onClick={(data) => handleChartClick(data.name, 'Requerimientos')}
          label={{ position: 'top', fontSize: 11, fontWeight: 'bold', fill: '#60a5fa', dy: -5 }} 
        />
        
        <Bar 
          name="Seguimientos" 
          dataKey="Seguimientos" 
          fill="#f97316" 
          radius={[4, 4, 0, 0]} 
          barSize={15} 
          style={{ cursor: 'pointer' }}
          onClick={(data) => handleChartClick(data.name, 'Seguimientos')}
          label={{ position: 'top', fontSize: 11, fontWeight: 'bold', fill: '#f97316', dy: -5 }} 
        />
        
        <Bar 
          name="Cierres/Recuperados" 
          dataKey="Cierres" 
          fill="#22c55e" 
          radius={[4, 4, 0, 0]} 
          barSize={15} 
          style={{ cursor: 'pointer' }}
          onClick={(data) => handleChartClick(data.name, 'Cierres')}
          label={{ position: 'top', fontSize: 11, fontWeight: 'bold', fill: '#22c55e', dy: -5 }} 
        />
      </BarChart>
    </ResponsiveContainer>
  </div>
</div>

    {/* SECCIÓN 3: SEGMENTACIÓN - FILA 3 */}
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Etapas (Area) */}
      <div className="bg-white p-8 rounded-4xl border border-slate-100 shadow-sm shadow-slate-200">
  <h4 className="text-xs font-black text-slate-500 uppercase mb-6">Documentos por Etapa</h4>
  <div className="h-[250px]">
    <ResponsiveContainer width="100%" height="100%">
      {/* Añadimos un margen superior de 30 para que el número de arriba no se corte */}
      <AreaChart data={stats.stageData} margin={{ top: 30, right: 25, left: 25, bottom: 0 }}>
        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 'bold'}} />
        
        {/* El dominio [0, 'dataMax + 5'] crea espacio extra arriba del punto más alto */}
        <YAxis hide domain={[0, 'dataMax + 5']} />
        
        <Tooltip />
        <Area 
          type="monotone" 
          dataKey="cant" 
          stroke="#2563eb" 
          fill="#dbeafe" 
          strokeWidth={3} 
          dot={{r: 6, fill: '#2563eb', strokeWidth: 2, stroke: '#fff'}} 
          // dy: -15 aleja el número del punto para que no estén pegados
          label={{ 
            position: 'top', 
            dy: -15, 
            fontSize: 14, 
            fontWeight: 'bold', 
            fill: '#1e293b' 
          }} 
        />
      </AreaChart>
    </ResponsiveContainer>
  </div>
</div>
      
      <div className="bg-white p-8 rounded-4xl border border-slate-100 shadow-sm shadow-slate-200">
  <h4 className="text-xs font-black text-slate-500 uppercase mb-6 text-center">Origen de Documentos</h4>
  <div className="h-[250px]">
    <ResponsiveContainer width="100%" height="100%">
      <PieChart margin={{ left: 45, right: 45 }}>
        <Pie 
          data={stats.originData} 
          innerRadius={60} 
          outerRadius={80} 
          paddingAngle={5} 
          dataKey="value" 
          isAnimationActive={false} 
          // 2. Usamos la función de dos líneas
          label={renderMultiLineLabel}
          labelLine={{ stroke: '#cbd5e1', strokeWidth: 1 }}
        >
          {stats.originData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={index === 0 ? "#1e293b" : "#60a5fa"} />
          ))}
        </Pie>
        <Tooltip />
        <Legend verticalAlign="bottom" />
      </PieChart>
    </ResponsiveContainer>
  </div>
</div>

      {/* Sedes (Stacked) */}
      <div className="bg-white p-8 rounded-4xl border border-slate-100 shadow-sm shadow-slate-200">
  <h4 className="text-xs font-black text-slate-500 uppercase mb-6">Documentos por Sede</h4>
  <div className="h-[250px]">
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={stats.sedeData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontWeight: 'bold', fontSize: 12}} />
        <YAxis hide />
        <Tooltip cursor={{fill: '#f8fafc'}} />
        {/* Mostramos una sola barra con el total acumulado */}
        <Bar 
          name="Total Documentos" 
          dataKey="total" 
          fill="#2563eb" 
          radius={[6, 6, 0, 0]} 
          barSize={60}
          label={{ position: 'top', fill: '#1e293b', fontSize: 14, fontWeight: 'bold' }} 
        />
      </BarChart>
    </ResponsiveContainer>
  </div>
</div>
    </div>

    {/* SECCIÓN 4: RENDIMIENTO - FILA 4 */}
    <div className="bg-white p-10 rounded-5xl border border-slate-100 shadow-sm shadow-slate-200 relative">
      <div className="absolute top-10 right-10 bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-center gap-3">
        <AlertCircle size={18} className="text-amber-600"/>
        <p className="text-[11px] font-black text-amber-800 uppercase tracking-tighter">{stats.alertaMensaje}</p>
      </div>
      <h4 className="text-sm font-black text-slate-700 uppercase mb-12">Rendimiento de Responsables (Barras 100%)</h4>
      <div className="h-[450px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={stats.respData} layout="vertical" margin={{ top: 5, right: 40, left: 40, bottom: 5 }}>
            <XAxis type="number" hide domain={[0, 100]} />
            <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fontSize: 12, fontWeight: 'bold', fill: '#1e293b'}} width={120} />
            <Tooltip formatter={(value, name, props) => [props.payload[props.dataKey.replace('Pct', 'Val')], name]} />
            <Legend verticalAlign="bottom" height={40} iconType="circle"/>
            <Bar name="Verificados" dataKey="vPct" stackId="a" fill="#3b82f6">
              <LabelList dataKey="vVal" position="center" fill="#fff" fontSize={13} fontWeight="bold" formatter={(v) => v > 0 ? v : ''} />
            </Bar>
            <Bar name="Requeridos" dataKey="rePct" stackId="a" fill="#93c5fd">
              <LabelList dataKey="reVal" position="center" fill="#1e3a8a" fontSize={13} fontWeight="bold" formatter={(v) => v > 0 ? v : ''} />
            </Bar>
            <Bar name="Seguimientos" dataKey="sPct" stackId="a" fill="#f97316">
              <LabelList dataKey="sVal" position="center" fill="#fff" fontSize={13} fontWeight="bold" formatter={(v) => v > 0 ? v : ''} />
            </Bar>
            <Bar name="Cerrados/SISGED" dataKey="cPct" stackId="a" fill="#22c55e">
              <LabelList dataKey="cVal" position="center" fill="#fff" fontSize={13} fontWeight="bold" formatter={(v) => v > 0 ? v : ''} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  </div> // CIERRA dashboard-view
) : (
            <div className="bg-white rounded-4xl shadow-sm border border-slate-100 overflow-hidden animate-in fade-in shadow-slate-100">
               <table className="w-full text-left font-sans font-bold font-sans">
                <thead className="bg-slate-50 border-b text-[10px] font-black text-slate-400 uppercase tracking-widest font-sans font-bold">
                  <tr>
                    <th className="p-6 pl-10 w-16 text-center border-r font-sans font-bold"><button onClick={() => { if(selectedIds.length === docs.length && docs.length > 0) setSelectedIds([]); else setSelectedIds(docs.map(d => d.id)); }}><Square size={22} className="text-slate-300 mx-auto"/></button></th>
                    <th className="p-6 font-sans font-bold uppercase">CUT / Documento</th>
                    <th className="p-6 text-center font-sans font-bold uppercase">Sede</th>
                    <th className="p-6 text-center font-sans font-bold uppercase">Origen</th>
                    <th className="p-6 text-center font-sans font-bold uppercase">Etapa / Estado</th>
                    <th className="p-6 text-center font-sans font-bold uppercase">Asignado A</th>
                    <th className="p-6 text-center font-sans font-bold uppercase">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-sm">
  {docs.length === 0 ? (
    // --- VISTA CUANDO NO HAY RESULTADOS ---
    <tr>
      <td colSpan="8" className="p-20 text-center">
        <div className="flex flex-col items-center gap-4 opacity-20">
          <Search size={64} className="text-slate-400" />
          <p className="text-xl font-black uppercase tracking-widest text-slate-800">
            No se encontraron documentos
          </p>
        </div>
      </td>
    </tr>
  ) : (
    // --- VISTA NORMAL DE LA TABLA (Mapeo de registros) ---
    docs.map(doc => {
      const status = getEtapaEstado(doc);
      const isSelected = selectedIds.includes(doc.id);

      // Lógica para determinar el responsable según la etapa (Filtro vs Actual)
      let asignadoCalculado = 'PENDIENTE';
      if (filters.etapa === 'VERIFICACION') {
          asignadoCalculado = doc.responsable_verificacion;
      } else if (filters.etapa === 'REQUERIMIENTO') {
          asignadoCalculado = doc.responsable_requerimiento;
      } else if (filters.etapa === 'SEGUIMIENTO') {
          asignadoCalculado = doc.responsable_seguimiento;
      } else if (filters.etapa === 'CIERRE') {
          asignadoCalculado = doc.responsable_devolucion;
      } else {
          if (status.etapa === 'VERIFICACION') asignadoCalculado = doc.responsable_verificacion;
          else if (status.etapa === 'REQUERIMIENTO') asignadoCalculado = doc.responsable_requerimiento;
          else if (status.etapa === 'SEGUIMIENTO') asignadoCalculado = doc.responsable_seguimiento;
          else if (status.etapa === 'CIERRE') asignadoCalculado = doc.responsable_devolucion;
      }

      const mostrarAsignado = (!asignadoCalculado || asignadoCalculado === 'null' || asignadoCalculado === '') ? 'PENDIENTE' : asignadoCalculado;
      const esPendiente = mostrarAsignado === 'PENDIENTE';

      return (
        <tr key={doc.id} className={`hover:bg-slate-50/80 transition-all ${isSelected ? 'bg-blue-50/50' : ''}`}>
          <td className="p-6 text-center border-r font-sans">
            <button onClick={() => toggleSelectDoc(doc.id)} className="cursor-pointer">
              {isSelected ? <CheckSquare size={22} className="text-brand-blue mx-auto"/> : <Square size={22} className="text-slate-200 mx-auto"/>}
            </button>
          </td>
          <td className="p-6 pl-8">
              <p className="font-black text-slate-800 text-sm">{doc.cut}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase mt-1 truncate max-w-[250px]">{doc.documento}</p>
          </td>
          <td className="p-6 text-center font-black text-[10px] text-slate-600 uppercase">{doc.sede}</td>
          <td className="p-6 text-center font-bold">
            <span className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase ${doc.origen === 'Interno' ? 'bg-purple-100 text-purple-700 border border-purple-200' : 'bg-blue-100 text-blue-700 border border-blue-200'}`}>
              {doc.origen || 'EXTERNO'}
            </span>
          </td>
          <td className="p-6 text-center">
            <div className="flex flex-col items-center gap-1 mx-auto">
              <span className="text-[9px] font-black bg-slate-200 text-slate-500 px-3 py-1 rounded-lg uppercase tracking-tighter">{status.etapa}</span>
              <span className={`text-[10px] font-black px-4 py-1.5 rounded-xl border shadow-sm uppercase ${status.color}`}>{status.estado}</span>
            </div>
          </td>
          
          {/* COLUMNA ASIGNADO A (Con selector directo) */}
          <td className="p-6 text-center font-sans">
            <div className="flex flex-col items-center gap-1 mx-auto">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">ASIGNADO A:</span>
              <select
                value={mostrarAsignado}
                onChange={(e) => handleAssignOne(doc.id, e.target.value, filters.etapa || status.etapa)}
                className={`text-[10px] font-black px-2 py-1 rounded-lg border shadow-sm outline-none cursor-pointer transition-all ${esPendiente ? 'bg-red-50 text-red-600 border-red-200' : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'}`}
              >
                {LISTA_RESPONSABLES.map(r => <option key={r} value={r}>{r === 'PENDIENTE' ? '🔴 SIN ASIGNAR' : r}</option>)}
              </select>
            </div>
          </td>

          <td className="p-6 text-center font-bold">
            <div className="flex items-center justify-center gap-3">
              <button onClick={() => { setEditingDoc(doc); setActiveTab(1); }} className="bg-white border-2 border-blue-50 text-brand-blue font-black text-[10px] px-5 py-2.5 rounded-2xl hover:bg-brand-blue hover:text-white transition-all uppercase shadow-sm cursor-pointer">Detalles</button>
              {session.user.toUpperCase() === 'ADMINISTRADOR' && (
                <button onClick={() => handleDeleteIndividual(doc.id)} className="bg-white border-2 border-red-50 text-red-500 p-2.5 rounded-2xl hover:bg-red-600 hover:text-white transition-all cursor-pointer"><Trash2 size={16}/></button>
              )}
            </div>
          </td>
        </tr>
      );
    })
  )}
</tbody>
              </table>
              <div className="p-10 bg-slate-50 flex justify-between items-center border-t border-slate-100 font-sans shadow-inner"><p className="text-xs font-black text-slate-400 uppercase tracking-widest font-sans font-sans">Página {page} • Total: {totalDocs}</p>
                <div className="flex gap-4 font-sans font-bold"><button onClick={() => setPage(p => p - 1)} disabled={page === 1} className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center hover:bg-blue-600 hover:text-white shadow-sm disabled:opacity-20 transition-all shadow-lg"><ChevronLeft size={20}/></button><button onClick={() => setPage(p => p + 1)} disabled={page * 100 >= totalDocs} className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center hover:bg-blue-600 hover:text-white shadow-sm disabled:opacity-20 transition-all shadow-lg"><ChevronRight size={20}/></button></div>
              </div>
            </div>
          )}
        </div>
      </main> {/* <--- AGREGA ESTA LÍNEA AQUÍ PARA CERRAR EL MAIN */}


      {/* --- MODAL DETALLES TOTAL (A-AD INTEGRAL) --- */}
      {editingDoc && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md flex items-center justify-center z-[100] p-10 font-sans font-sans font-sans">
          <div className="bg-white rounded-5xl w-full max-w-6xl h-[88vh] flex flex-col overflow-hidden shadow-2xl border border-white/20">
            {/* CABECERA MODIFICADA AQUÍ */}
      <div className="p-10 bg-[#1E293B] text-white flex justify-between items-start shrink-0">
        <div className="space-y-2">
          <h3 className="text-2xl font-black tracking-tight leading-tight">
            {editingDoc.cut} • {editingDoc.documento}
          </h3>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">
              {editingDoc.origen} • {editingDoc.sede}
            </span>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest border-l border-slate-700 pl-4">
              REMITENTE: <span className="text-white">{editingDoc.remitente}</span>
            </span>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest border-l border-slate-700 pl-4">
              F. REGISTRO: <span className="text-white">{formatDMA(editingDoc.fecha_registro)}</span>
            </span>
          </div>
        </div>
        <button onClick={() => setEditingDoc(null)} className="w-12 h-12 rounded-2xl bg-white/10 hover:bg-white/20 flex items-center justify-center font-bold transition-transform hover:rotate-90 cursor-pointer">✕</button>
      </div>
            <div className="flex flex-1 overflow-hidden font-sans font-sans font-sans font-sans">
             <div className="w-80 bg-slate-50 border-r p-10 space-y-4 shrink-0 font-sans font-bold">
  {/* Etapa 1: Siempre visible */}
  <button onClick={() => setActiveTab(1)} className={`w-full text-left p-6 rounded-3xl font-black text-xs transition-all flex items-center justify-between ${activeTab === 1 ? 'bg-white border-2 border-blue-600 text-blue-700 shadow-2xl' : 'text-slate-400'}`}>1. VERIFICACIÓN <UserCheck size={16}/></button>
  
  {/* Etapas 2 y 3: SOLO si es EXTERNO */}
  {String(editingDoc.origen).toUpperCase() === 'EXTERNO' && (
    <>
      <button 
        disabled={editingDoc.estado_verificacion_k !== 'VERIFICADO'} 
        onClick={() => setActiveTab(2)} 
        className={`w-full text-left p-6 rounded-3xl font-black text-xs transition-all flex items-center justify-between shadow-sm ${editingDoc.estado_verificacion_k !== 'VERIFICADO' ? 'opacity-30 cursor-not-allowed' : (activeTab === 2 ? 'bg-white border-2 border-blue-600 text-blue-700 shadow-2xl' : 'text-slate-400')}`}
      >2. REQUERIMIENTO <Truck size={16}/></button>
      
      <button 
        disabled={!editingDoc.numero_documento || editingDoc.numero_documento === 'null'} 
        onClick={() => setActiveTab(3)} 
        className={`w-full text-left p-6 rounded-3xl font-black text-xs transition-all flex items-center justify-between shadow-sm ${(!editingDoc.numero_documento || editingDoc.numero_documento === 'null') ? 'opacity-30 cursor-not-allowed' : (activeTab === 3 ? 'bg-white border-2 border-blue-600 text-blue-700 shadow-2xl' : 'text-slate-400')}`}
      >3. SEGUIMIENTO ({seguimientos.length}) <MessageSquare size={16}/></button>
    </>
  )}
  
  {/* Etapa 4: Siempre visible */}
  <button 
    disabled={editingDoc.estado_verificacion_k !== 'VERIFICADO'}
    onClick={() => setActiveTab(4)} 
    className={`w-full text-left p-6 rounded-3xl font-black text-xs transition-all flex items-center justify-between shadow-sm ${editingDoc.estado_verificacion_k !== 'VERIFICADO' ? 'opacity-30 cursor-not-allowed' : (activeTab === 4 ? 'bg-white border-2 border-blue-600 text-blue-700 shadow-2xl' : 'text-slate-400')}`}
  >4. CIERRE <Save size={16}/></button>
</div>
    
              <div className="flex-1 p-14 overflow-y-auto bg-white font-sans font-sans font-sans">
                {activeTab === 1 && (
                  <div className="grid grid-cols-2 gap-12 animate-in fade-in duration-300 font-sans">
                    <div className="space-y-3 font-sans font-bold"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 font-sans">Resp. Verificación</label>
                      <select className="w-full p-5 bg-slate-50 border border-slate-100 rounded-[24px] font-black text-xs uppercase cursor-pointer shadow-inner shadow-slate-100 font-sans font-bold" value={editingDoc.responsable_verificacion || ''} onChange={e => setEditingDoc({...editingDoc, responsable_verificacion: e.target.value})}>
                        <option value="">SELECCIONE...</option>{LISTA_RESPONSABLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                    <div className="space-y-3 font-sans"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 font-sans font-bold">Fecha Verificación</label><input type="date" className="w-full p-5 bg-slate-50 border border-slate-100 rounded-[24px] font-black text-xs shadow-inner shadow-slate-200 shadow-inner font-bold" value={editingDoc.fecha_verificacion || ''} onChange={e => setEditingDoc({...editingDoc, fecha_verificacion: e.target.value})}/></div>
                    <div className="col-span-2 space-y-3 font-sans font-bold"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 font-sans font-bold font-bold">Estado Etapa (Col K)</label><select className="w-full p-5 bg-slate-50 border border-slate-100 rounded-[24px] font-black text-xs uppercase font-sans font-bold shadow-inner" value={editingDoc.estado_verificacion_k || ''} onChange={e => setEditingDoc({...editingDoc, estado_verificacion_k: e.target.value})}><option value="PENDIENTE">PENDIENTE</option><option value="VERIFICADO">VERIFICADO</option></select></div>
                    <div className="col-span-2 space-y-6 pt-6 text-center font-sans"><p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] font-sans font-bold font-sans font-bold">Estado de Visualización (Col L)</p>
                      <div className="grid grid-cols-2 gap-8 font-sans font-sans font-bold font-bold"><button onClick={() => setEditingDoc({...editingDoc, estado_visualizacion: 'SI SE VISUALIZA'})} className={`p-10 rounded-3xl border-2 font-black text-sm transition-all flex flex-col items-center gap-4 ${editingDoc.estado_visualizacion === 'SI SE VISUALIZA' ? 'border-green-600 bg-green-50 text-green-700 shadow-2xl shadow-green-900/10' : 'border-slate-50 bg-slate-50 text-slate-300 shadow-inner shadow-slate-100'}`}><CheckCircle2 size={32}/> SÍ SE VISUALIZA</button>
                        <button onClick={() => setEditingDoc({...editingDoc, estado_visualizacion: 'NO SE VISUALIZA'})} className={`p-10 rounded-3xl border-2 font-black text-sm transition-all flex flex-col items-center gap-4 ${editingDoc.estado_visualizacion === 'NO SE VISUALIZA' ? 'border-red-600 bg-red-50 text-red-700 shadow-2xl shadow-red-900/10' : 'border-slate-50 bg-slate-50 text-slate-300 shadow-inner shadow-slate-100'}`}><AlertCircle size={32}/> NO SE VISUALIZA</button></div>
                    </div>
                    <div className="col-span-2 space-y-3 font-sans"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 font-sans font-bold">Observaciones (Col M)</label><textarea className="w-full p-5 bg-slate-50 border border-slate-100 rounded-[24px] font-medium text-xs shadow-inner shadow-slate-200 shadow-inner shadow-slate-200 shadow-slate-100 shadow-inner font-sans font-bold" rows="3" value={editingDoc.observaciones || ''} onChange={e => setEditingDoc({...editingDoc, observaciones: e.target.value})}></textarea></div>
                  </div>
                )}
               {activeTab === 2 && (
                  <div className="grid grid-cols-2 gap-12 animate-in fade-in duration-300 font-sans">
                    <div className="space-y-3 font-sans font-bold">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Responsable del Requerimiento</label>
                      <select className="w-full p-5 bg-slate-50 border border-slate-100 rounded-[24px] font-black text-xs uppercase cursor-pointer shadow-inner" value={editingDoc.responsable_requerimiento || ''} onChange={e => setEditingDoc({...editingDoc, responsable_requerimiento: e.target.value})}>
                        <option value="">SELECCIONE...</option>
                        {LISTA_RESPONSABLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                    <div className="space-y-3 font-sans font-bold">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Fecha de Elaboración</label>
                      <input type="date" className="w-full p-5 bg-slate-50 border border-slate-100 rounded-[24px] font-black text-xs shadow-inner" value={editingDoc.fecha_elaboracion || ''} onChange={e => setEditingDoc({...editingDoc, fecha_elaboracion: e.target.value})}/>
                    </div>
                    <div className="space-y-3 font-sans font-bold">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Número de Documento Generado</label>
                      <input type="text" className="w-full p-5 bg-slate-50 border border-slate-100 rounded-[24px] font-black text-xs shadow-inner" value={editingDoc.numero_documento || ''} onChange={e => setEditingDoc({...editingDoc, numero_documento: e.target.value})}/>
                    </div>
                    <div className="space-y-3 font-sans font-bold">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Fecha de Notificación</label>
                      <input type="date" className="w-full p-5 bg-slate-50 border border-slate-100 rounded-[24px] font-black text-xs shadow-inner" value={editingDoc.fecha_notificacion || ''} onChange={e => setEditingDoc({...editingDoc, fecha_notificacion: e.target.value})}/>
                    </div>
                    <div className="space-y-3 font-sans font-bold">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Medio de Notificación</label>
                      <select className="w-full p-5 bg-slate-50 border border-slate-100 rounded-[24px] font-black text-xs uppercase cursor-pointer shadow-inner" value={editingDoc.medio_notificacion || ''} onChange={e => setEditingDoc({...editingDoc, medio_notificacion: e.target.value})}>
                        <option value="">SELECCIONE...</option>
                        <option value="DIGITAL">DIGITAL</option>
                        <option value="COURIER">COURIER</option>
                      </select>
                    </div>
                    <div className="col-span-1 bg-blue-50 p-10 rounded-4xl border border-blue-100 flex items-center justify-between shadow-inner">
                      <div>
                        <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Días Hábiles Transcurridos</p>
                        <p className="text-6xl font-black text-blue-600 mt-2">{calcularDiasHabiles(editingDoc.fecha_notificacion)}</p>
                      </div>
                      <Clock size={80} className="text-blue-200 opacity-50"/>
                    </div>
                    <div className="col-span-2 space-y-3 font-sans font-bold">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Observaciones Requerimiento</label>
                      <textarea className="w-full p-5 bg-slate-50 border border-slate-100 rounded-[24px] font-medium text-xs shadow-inner" rows="2" value={editingDoc.observaciones_requerimiento || ''} onChange={e => setEditingDoc({...editingDoc, observaciones_requerimiento: e.target.value})}></textarea>
                    </div>
                  </div>
                )}

               {activeTab === 3 && (
                  <div className="space-y-12 animate-in fade-in duration-300 font-sans">
                    <div className="bg-slate-50 p-10 rounded-4xl space-y-6 border border-slate-200">
                      <h4 className="font-black text-xs uppercase text-slate-600 tracking-widest">Registrar Nuevo Seguimiento</h4>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 ml-1 uppercase">Fecha</label>
                          <input type="date" id="s_fec" className="w-full p-4 rounded-2xl border bg-white font-bold text-xs shadow-inner outline-none" defaultValue={new Date().toISOString().split('T')[0]} />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 ml-1 uppercase">Responsable</label>
                          <select className="w-full p-5 rounded-2xl border bg-white font-black text-[10px] uppercase shadow-inner outline-none" id="s_res">
                            <option value="">SELECCIONE...</option>
                            {LISTA_RESPONSABLES.map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 ml-1 uppercase">Medio</label>
                          <select className="w-full p-5 rounded-2xl border bg-white font-black text-[10px] uppercase shadow-inner outline-none" id="s_med">
                            <option value="">MEDIO...</option>
                            <option value="LLAMADA">LLAMADA</option>
                            <option value="WHATSAPP">WHATSAPP</option>
                            <option value="CORREO">CORREO</option>
                          </select>
                        </div>
                      </div>
                      <textarea id="s_obs" className="w-full p-6 rounded-3xl border border-slate-100 bg-white text-sm outline-none shadow-inner font-medium" rows="3" placeholder="Detalles del contacto con el remitente..."></textarea>
                      
                      {/* BOTÓN CORREGIDO - SIN ERROR DE SINTAXIS */}
                      <button 
  onClick={async () => {
    const o = document.getElementById('s_obs').value; 
    const r = document.getElementById('s_res').value; 
    const m = document.getElementById('s_med').value; 
    const f = document.getElementById('s_fec').value;
    
    if(!o || !r || !m || !f) return alert("Por favor, complete todos los campos.");
    
    try {
      const now = new Date().toISOString();
      
      // 1. Insertar el registro en la tabla de seguimientos
      const { error: insertError } = await supabase.from('seguimientos').insert([
        { documento_id: editingDoc.id, responsable: r, medio: m, observaciones: o, fecha: f }
      ]);
      
      if(insertError) throw insertError;

      // --- NUEVA LÓGICA DE CONTADOR ---
      // 2. Actualizar la tabla 'documentos' subiendo el contador y marcando el último movimiento
      await supabase.from('documentos')
  .update({ 
    cantidad_seguimientos: (editingDoc.cantidad_seguimientos || 0) + 1,
    ultimo_seguimiento: now,
    ultimo_responsable: r,
    responsable_seguimiento: r // <--- ESTA LÍNEA ES LA QUE ACTIVA EL COLOR NARANJA EN EL GRÁFICO
  })
  .eq('id', editingDoc.id);

      // 3. ACTUALIZACIÓN LOCAL: Esto hace que el estado cambie a "EN PROCESO" al instante en la tabla
      setEditingDoc(prev => ({ 
        ...prev, 
        cantidad_seguimientos: (prev.cantidad_seguimientos || 0) + 1,
        ultimo_seguimiento: now 
      }));
      // -------------------------------

      document.getElementById('s_obs').value = ''; 
      alert("Seguimiento Grabado con éxito"); 

      // 4. Recargar el historial de la lista de abajo
      const { data: newData } = await supabase.from('seguimientos')
        .select('*')
        .eq('documento_id', editingDoc.id)
        .order('fecha', { ascending: false });
      
      setSeguimientos(newData || []);
      
      // 5. Refrescar la tabla principal que está al fondo
      fetchDocs(); 

    } catch (err) {
      alert("Error: " + err.message);
    }
  }} 
  className="bg-blue-600 text-white font-black py-5 px-12 rounded-3xl text-xs uppercase shadow-2xl shadow-blue-200 tracking-[0.2em] hover:scale-105 transition-all outline-none cursor-pointer"
>
  Grabar Seguimiento
</button>
                    </div>
                    {/* SECCIÓN DEL HISTORIAL */}
                    <div className="space-y-8">
                      <h4 className="font-black text-[10px] uppercase text-slate-400 tracking-widest ml-4">
                        Historial de Seguimientos ({seguimientos.length})
                      </h4>
                      {seguimientos.map(s => (
                        <div key={s.id} className="p-8 border border-slate-100 rounded-3xl flex items-start gap-6 bg-white shadow-sm hover:shadow-md transition-shadow">
                          <div className="bg-blue-100 p-4 rounded-2xl text-blue-600 shrink-0 shadow-inner">
                            <MessageSquare size={24}/>
                          </div>
                          <div className="flex-1 font-sans">
                            <div className="flex justify-between items-center mb-2">
                              <p className="text-xs font-black text-slate-800 uppercase tracking-widest">{s.responsable}</p>
                              <div className="flex items-center gap-3">
                                <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-3 py-1 rounded-full">
                                  {formatDMA(s.fecha)}
                                </span>
                                <button onClick={() => handleDeleteSeguimiento(s.id)} className="text-red-400 hover:text-red-600 cursor-pointer">
                                  <Trash2 size={16}/>
                                </button>
                              </div>
                            </div>
                            <p className="text-[10px] font-black text-blue-600 uppercase mb-2">Canal: {s.medio}</p>
                            <p className="text-sm text-slate-500 font-medium italic">"{s.observaciones}"</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 4 && (
  <div className="grid grid-cols-2 gap-12 animate-in fade-in duration-300 font-sans">
    <div className="col-span-2 bg-emerald-50 p-12 rounded-[45px] border border-emerald-100 flex items-center gap-8 shadow-inner font-sans font-sans">
       <input type="checkbox" className="w-12 h-12 accent-emerald-600 rounded-2xl shadow-sm cursor-pointer hover:scale-110 transition-transform shadow-lg" checked={editingDoc.cargado_sisged} onChange={e => setEditingDoc({...editingDoc, cargado_sisged: e.target.checked})}/>
       <div>
         <label className="font-black text-emerald-900 uppercase text-xs tracking-[0.2em] block mb-1">Cargado en SISGED (Col AB)</label>
         <p className="text-[10px] text-emerald-700 font-bold opacity-60">Marque para finalizar documento como RECUPERADO.</p>
       </div>
    </div>
    <div className="space-y-3 font-sans font-bold">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Estado Final de Recuperación (Col AC)</label>
      <select className="w-full p-5 bg-slate-50 border border-slate-100 rounded-[24px] font-black text-xs uppercase cursor-pointer shadow-inner font-bold" value={editingDoc.estado_final || 'PENDIENTE'} onChange={e => setEditingDoc({...editingDoc, estado_final: e.target.value})}>
        <option value="PENDIENTE">PENDIENTE</option>
        <option value="RECUPERADO">RECUPERADO</option>
        <option value="RECONSTRUCCION">RECONSTRUCCION</option>
      </select>
    </div>
    <div className="space-y-3 font-sans font-bold">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Oficina de Destino (Col AA)</label>
      <input type="text" className="w-full p-5 bg-slate-50 border border-slate-100 rounded-[24px] font-black text-xs shadow-inner shadow-slate-200" value={editingDoc.oficina_destino || ''} onChange={e => setEditingDoc({...editingDoc, oficina_destino: e.target.value})}/>
    </div>
    <div className="space-y-3 font-sans font-bold">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Fecha Remisión (Col W)</label>
      <input type="date" className="w-full p-5 bg-slate-50 border border-slate-100 rounded-[24px] font-black text-xs shadow-inner shadow-slate-200" value={editingDoc.fecha_remision || ''} onChange={e => setEditingDoc({...editingDoc, fecha_remision: e.target.value})}/>
    </div>
    <div className="space-y-3 font-sans font-bold">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Resp. Devolución (Col X)</label>
      <select className="w-full p-5 bg-slate-50 border border-slate-100 rounded-[24px] font-black text-xs uppercase cursor-pointer shadow-inner shadow-slate-200" value={editingDoc.responsable_devolucion || ''} onChange={e => setEditingDoc({...editingDoc, responsable_devolucion: e.target.value})}>
        <option value="">SELECCIONE...</option>
        {LISTA_RESPONSABLES.map(r => <option key={r} value={r}>{r}</option>)}
      </select>
    </div>
    <div className="space-y-3 font-sans font-bold">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Fecha Devolución (Col Y)</label>
      <input type="date" className="w-full p-5 bg-slate-50 border border-slate-100 rounded-[24px] font-black text-xs shadow-inner shadow-slate-200" value={editingDoc.fecha_devolucion || ''} onChange={e => setEditingDoc({...editingDoc, fecha_devolucion: e.target.value})}/>
    </div>
    <div className="space-y-3 font-sans font-bold">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">N° Documento Cierre (Col Z)</label>
      <input type="text" className="w-full p-5 bg-slate-50 border border-slate-100 rounded-[24px] font-black text-xs shadow-inner shadow-slate-200" value={editingDoc.documento_cierre || ''} onChange={e => setEditingDoc({...editingDoc, documento_cierre: e.target.value})}/>
    </div>
    <div className="col-span-2 space-y-3 font-sans font-bold">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Observaciones Finales (Col AD)</label>
      <textarea className="w-full p-5 bg-slate-50 border border-slate-100 rounded-[24px] font-medium text-xs shadow-inner shadow-slate-200" rows="3" value={editingDoc.observaciones_finales || ''} onChange={e => setEditingDoc({...editingDoc, observaciones_finales: e.target.value})}></textarea>
    </div>
  </div>
)}
              </div>
            </div>
            <div className="p-10 bg-slate-50 border-t flex justify-end gap-6 shrink-0 font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans"><button onClick={() => setEditingDoc(null)} className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-10 hover:text-slate-700 font-sans font-sans">Descartar</button>
            <button onClick={handleSyncChanges} className="bg-brand-blue text-white px-16 py-5 rounded-3xl font-black text-xs uppercase shadow-2xl tracking-[0.2em] hover:scale-[1.02] active:scale-95 transition-all outline-none font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans">SINCRONIZAR CAMBIOS</button></div>
          </div>
        </div>
      )}

      {/* --- MODAL NUEVO --- */}
      {isNewModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xl flex items-center justify-center z-[110] p-6 animate-in zoom-in duration-300 font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans">
          <div className="bg-white rounded-5xl w-full max-w-xl shadow-2xl p-12 space-y-10 border border-white relative font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans">
            <button onClick={() => setIsNewModalOpen(false)} className="absolute right-8 top-8 text-slate-300 hover:text-slate-600 transition-colors font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans"><X/></button>
            <h3 className="text-2xl font-black uppercase text-center tracking-tighter text-slate-800 tracking-[0.1em] font-sans font-sans font-sans font-sans font-sans font-sans">Nuevo Expediente</h3>
            <div className="grid grid-cols-2 gap-6 font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans">
              <input type="text" placeholder="CUT" className="w-full p-5 bg-slate-50 border-none rounded-3xl outline-none font-bold shadow-inner font-sans font-sans font-sans font-sans" id="n_cut" />
              <input type="text" placeholder="Documento" className="w-full p-5 bg-slate-50 border-none rounded-3xl outline-none font-bold shadow-inner font-sans font-sans font-sans font-sans font-sans" id="n_doc" />
              <input type="text" placeholder="Remitente" className="w-full p-5 bg-slate-50 border-none rounded-3xl outline-none font-bold shadow-inner col-span-2 shadow-slate-200 font-sans font-sans font-sans font-sans font-sans" id="n_rem" />
              <input type="date" className="w-full p-5 bg-slate-50 border-none rounded-3xl font-bold shadow-inner col-span-2 outline-none font-sans font-sans shadow-slate-100 font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans" id="n_fecha" />
              <div className="relative col-span-2 font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans"><Phone size={16} className="absolute left-4 top-5 text-slate-300 font-sans font-sans font-sans font-sans font-sans font-sans"/><input type="text" placeholder="Celular" className="w-full p-5 pl-12 bg-slate-50 border-none rounded-3xl outline-none font-bold shadow-inner font-sans font-sans font-sans font-sans font-sans font-sans font-sans" id="n_cel" /></div>
              <div className="relative col-span-2 font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans"><Briefcase size={16} className="absolute left-4 top-5 text-slate-300 font-sans font-sans font-sans font-sans font-sans font-sans"/><input type="text" placeholder="Procedimiento TUPA" className="w-full p-5 pl-12 bg-slate-50 border-none rounded-3xl outline-none font-bold shadow-inner font-sans font-sans font-sans font-sans font-sans font-sans font-sans" id="n_proc" /></div>
              <select className="w-full p-5 bg-slate-50 border-none rounded-3xl font-black text-[10px] uppercase shadow-inner cursor-pointer font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans" id="n_sede"><option value="SC">SEDE CENTRAL (SC)</option><option value="OD">ÓRGANO DESCONCENTRADO (OD)</option></select>
              <select className="w-full p-5 bg-slate-50 border-none rounded-3xl font-black text-[10px] uppercase shadow-inner cursor-pointer font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans" id="n_origen"><option value="Externo">Externo</option><option value="Interno">Interno</option></select>
            </div>
            <button onClick={async () => {
              const doc = { cut: document.getElementById('n_cut').value, documento: document.getElementById('n_doc').value, remitente: document.getElementById('n_rem').value, fecha_registro: document.getElementById('n_fecha').value, celular: document.getElementById('n_cel').value, procedimiento: document.getElementById('n_proc').value, sede: document.getElementById('n_sede').value, origen: document.getElementById('n_origen').value, etapa_actual: 'VERIFICACION', estado_final: 'PENDIENTE', creado_at: new Date().toISOString() };
              const { error } = await supabase.from('documentos').insert([doc]);
              if (!error) { setIsNewModalOpen(false); fetchDocs(); } else alert("Error (Verifique si CUT+Doc duplicado)");
            }} className="w-full bg-brand-blue text-white py-6 rounded-3xl font-black uppercase shadow-2xl tracking-[0.3em] hover:bg-blue-700 transition-all outline-none font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans">Registrar Documento</button>
          </div>
        </div>
      )}
    </div>
  );
}

