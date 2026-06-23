import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Timestamp,
} from "firebase/firestore";
import { auth, db } from "../config/firebaseConfig";

export type TipoPlanilla = "diaria" | "resumen";

export type TipoColumnaPlanilla =
  | "texto"
  | "numero"
  | "fecha"
  | "nota"
  | "textarea"
  | "select"
  | "boolean";

export interface ColumnaPlanilla {
  id: string;
  titulo: string;
  tipo: TipoColumnaPlanilla;
  orden: number;
  visibleAlumno: boolean;
  requerida?: boolean;
  opciones?: string[];
}

export interface PlanillaTP {
  id: string;
  alumnoId: string;
  alumnoNombre?: string;
  moduloId?: string;
  seccionId: string;
  subseccionPath?: string | null;
  anio?: string | number;
  cursada?: string;
  operatoria?: string;
  tipo: TipoPlanilla;
  titulo: string;
  columnas: ColumnaPlanilla[];
  creadoPor: string;
  actualizadoPor?: string;
  fechaCreacion: Timestamp;
  fechaActualizacion: Timestamp;
}

export interface FilaPlanilla {
  id: string;
  orden: number;
  celdas: Record<string, any>;
  fechaCreacion: Timestamp;
  fechaActualizacion: Timestamp;
}

export interface FilaBasePlanilla {
  id: string;
  orden: number;
  celdas: Record<string, any>;
}

export interface PlanillaBaseTP {
  id: string;
  nombre: string;
  descripcion?: string | null;
  tipo: TipoPlanilla;
  columnas: ColumnaPlanilla[];
  filasBase?: FilaBasePlanilla[];
  activa: boolean;
  creadaPor?: string;
  actualizadaPor?: string;
  fechaCreacion?: Timestamp;
  fechaActualizacion?: Timestamp;
}

export interface VistaAlumnoPlanilla {
  planillaId: string;
  alumnoId: string;
  alumnoNombre?: string;
  titulo: string;
  tipo: TipoPlanilla;
  moduloId?: string | null;
  seccionId: string;
  subseccionPath?: string | null;
  columnasVisibles: ColumnaPlanilla[];
  filasVisibles: Array<{
    id: string;
    orden: number;
    celdas: Record<string, any>;
  }>;
  fechaActualizacion: Timestamp;
}

export type PlantillaPlanillaId =
  | "op1op2Diaria"
  | "op1op2Resumen"
  | "op3op6Diaria"
  | "op3op6Resumen";

export const plantillasPlanillas: Record<PlantillaPlanillaId, ColumnaPlanilla[]> = {
  op1op2Diaria: [
    { id: "fecha", titulo: "Fecha", tipo: "fecha", orden: 0, visibleAlumno: true },
    { id: "tema", titulo: "Tema", tipo: "textarea", orden: 1, visibleAlumno: true },
    { id: "nota_teoria", titulo: "Nota teoria", tipo: "nota", orden: 2, visibleAlumno: true },
    { id: "nota_tp", titulo: "Nota TP", tipo: "nota", orden: 3, visibleAlumno: true },
    { id: "observaciones", titulo: "Observaciones", tipo: "textarea", orden: 4, visibleAlumno: false },
  ],
  op1op2Resumen: [
    { id: "trabajo_parcialito", titulo: "Trabajo / Parcialito", tipo: "textarea", orden: 0, visibleAlumno: true },
    { id: "fechas", titulo: "Fecha/s", tipo: "texto", orden: 1, visibleAlumno: true },
    { id: "nota_final_tp", titulo: "Nota Final TP", tipo: "nota", orden: 2, visibleAlumno: true },
    { id: "nota_final_parcialito", titulo: "Nota Final Parcialito", tipo: "nota", orden: 3, visibleAlumno: true },
    { id: "docente", titulo: "Docente", tipo: "texto", orden: 4, visibleAlumno: true },
    { id: "observaciones", titulo: "Observaciones", tipo: "textarea", orden: 5, visibleAlumno: false },
  ],
  op3op6Diaria: [
    { id: "fecha", titulo: "Fecha", tipo: "fecha", orden: 0, visibleAlumno: true },
    { id: "trabajo_realizado", titulo: "Trabajo realizado", tipo: "textarea", orden: 1, visibleAlumno: true },
    { id: "pieza", titulo: "Pieza", tipo: "texto", orden: 2, visibleAlumno: true },
    { id: "nota", titulo: "Nota", tipo: "nota", orden: 3, visibleAlumno: true },
    { id: "docente", titulo: "Docente", tipo: "texto", orden: 4, visibleAlumno: true },
    { id: "observaciones", titulo: "Observaciones", tipo: "textarea", orden: 5, visibleAlumno: false },
  ],
  op3op6Resumen: [
    { id: "trabajo", titulo: "Trabajo", tipo: "textarea", orden: 0, visibleAlumno: true },
    { id: "fechas", titulo: "Fecha/s", tipo: "texto", orden: 1, visibleAlumno: true },
    { id: "pieza", titulo: "Pieza", tipo: "texto", orden: 2, visibleAlumno: true },
    { id: "nota_final", titulo: "Nota final", tipo: "nota", orden: 3, visibleAlumno: true },
    { id: "docente", titulo: "Docente", tipo: "texto", orden: 4, visibleAlumno: true },
    { id: "observaciones", titulo: "Observaciones", tipo: "textarea", orden: 5, visibleAlumno: false },
  ],
};

const datosPlanillasBaseIniciales: Record<PlantillaPlanillaId, { nombre: string; tipo: TipoPlanilla }> = {
  op1op2Diaria: { nombre: "OP1/OP2 diaria", tipo: "diaria" },
  op1op2Resumen: { nombre: "OP1/OP2 final", tipo: "resumen" },
  op3op6Diaria: { nombre: "OP3-OP6 diaria", tipo: "diaria" },
  op3op6Resumen: { nombre: "OP3-OP6 final", tipo: "resumen" },
};

const idsPlanillasBaseIniciales: Record<PlantillaPlanillaId, string> = {
  op1op2Diaria: "base-op1-op2-diaria",
  op1op2Resumen: "base-op1-op2-final",
  op3op6Diaria: "base-op3-op6-diaria",
  op3op6Resumen: "base-op3-op6-final",
};

export const planillasBaseIniciales: PlanillaBaseTP[] = (
  Object.keys(plantillasPlanillas) as PlantillaPlanillaId[]
).map((id) => ({
  id: idsPlanillasBaseIniciales[id],
  nombre: datosPlanillasBaseIniciales[id].nombre,
  tipo: datosPlanillasBaseIniciales[id].tipo,
  columnas: [...plantillasPlanillas[id]].sort((a, b) => a.orden - b.orden).map((col) => ({ ...col })),
  filasBase: [],
  activa: true,
}));

interface CrearPlanillaParams {
  alumnoId: string;
  alumnoNombre?: string;
  moduloId?: string;
  seccionId: string;
  subseccionPath?: string | null;
  anio?: string | number;
  cursada?: string;
  operatoria?: string;
  tipo: TipoPlanilla;
  titulo: string;
  plantillaId: PlantillaPlanillaId;
}

interface CrearPlanillaDesdeBaseParams extends Omit<CrearPlanillaParams, "plantillaId"> {
  base: PlanillaBaseTP;
}

type CrearPlanillaBaseInput = {
  nombre: string;
  descripcion?: string | null;
  tipo: TipoPlanilla;
};

interface ContextoPlanillasParams {
  moduloId?: string;
  seccionId: string;
  subseccionPath?: string | null;
}

interface AlumnoPlanillasParams extends ContextoPlanillasParams {
  alumnoId: string;
}

interface VistaAlumnoContextoParams extends AlumnoPlanillasParams {}

type FilaPlanillaInput = {
  orden: number;
  celdas: Record<string, any>;
};

type DatosPlanillaInput = {
  titulo?: string;
};

type DatosPlanillaBaseInput = Partial<{
  nombre: string;
  descripcion: string | null;
  tipo: TipoPlanilla;
  columnas: ColumnaPlanilla[];
  filasBase: FilaBasePlanilla[];
  activa: boolean;
}>;

const ordenarColumnas = (columnas: ColumnaPlanilla[]) =>
  [...columnas].sort((a, b) => a.orden - b.orden);

const ordenarFilas = (filas: FilaPlanilla[]) =>
  [...filas].sort((a, b) => a.orden - b.orden);

const getCurrentUserId = () => {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("No autenticado");
  return uid;
};

export async function crearPlanillaDesdePlantilla(params: CrearPlanillaParams): Promise<string> {
  const base = planillasBaseIniciales.find((item) => item.id === idsPlanillasBaseIniciales[params.plantillaId]);
  if (!base) throw new Error("Plantilla no encontrada");
  return crearPlanillaDesdeBase({ ...params, base });
}

export async function crearPlanillaDesdeBase(params: CrearPlanillaDesdeBaseParams): Promise<string> {
  const uid = getCurrentUserId();
  const columnas = ordenarColumnas(params.base.columnas ?? []).map((col) => ({ ...col }));
  const filasBase = [...(params.base.filasBase ?? [])].sort((a, b) => a.orden - b.orden);

  const ref = await addDoc(collection(db, "planillas_tp"), {
    alumnoId: params.alumnoId,
    alumnoNombre: params.alumnoNombre ?? null,
    moduloId: params.moduloId ?? null,
    seccionId: params.seccionId,
    subseccionPath: params.subseccionPath ?? null,
    anio: params.anio ?? null,
    cursada: params.cursada ?? null,
    operatoria: params.operatoria ?? null,
    tipo: params.tipo,
    titulo: params.titulo.trim(),
    columnas,
    creadoPor: uid,
    actualizadoPor: uid,
    fechaCreacion: serverTimestamp(),
    fechaActualizacion: serverTimestamp(),
  });

  await Promise.all(
    filasBase.map((fila) =>
      addDoc(collection(db, "planillas_tp", ref.id, "filas"), {
        orden: fila.orden,
        celdas: fila.celdas ?? {},
        fechaCreacion: serverTimestamp(),
        fechaActualizacion: serverTimestamp(),
      }),
    ),
  );

  await generarVistaAlumno(ref.id);
  return ref.id;
}

export async function obtenerPlanillasBase(): Promise<PlanillaBaseTP[]> {
  await inicializarPlanillasBase();
  const snap = await getDocs(query(collection(db, "planillas_base_tp"), where("activa", "==", true)));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as PlanillaBaseTP)
    .filter((base) => base.activa !== false);
}

export async function obtenerPlanillaBasePorId(planillaBaseId: string): Promise<PlanillaBaseTP | null> {
  await inicializarPlanillasBase();
  const snap = await getDoc(doc(db, "planillas_base_tp", planillaBaseId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as PlanillaBaseTP) : null;
}

export async function crearPlanillaBase(data: CrearPlanillaBaseInput): Promise<string> {
  const uid = getCurrentUserId();
  const ref = await addDoc(collection(db, "planillas_base_tp"), {
    nombre: data.nombre.trim(),
    descripcion: data.descripcion ?? null,
    tipo: data.tipo,
    columnas: [],
    filasBase: [],
    activa: true,
    creadaPor: uid,
    actualizadaPor: uid,
    fechaCreacion: serverTimestamp(),
    fechaActualizacion: serverTimestamp(),
  });
  return ref.id;
}

export async function actualizarPlanillaBase(
  planillaBaseId: string,
  data: DatosPlanillaBaseInput,
): Promise<void> {
  const uid = getCurrentUserId();
  const payload: Record<string, any> = {
    ...data,
    actualizadaPor: uid,
    fechaActualizacion: serverTimestamp(),
  };
  if (payload.columnas) payload.columnas = ordenarColumnas(payload.columnas);
  if (payload.filasBase) payload.filasBase = [...payload.filasBase].sort((a, b) => a.orden - b.orden);
  await updateDoc(doc(db, "planillas_base_tp", planillaBaseId), payload);
}

export async function eliminarPlanillaBase(planillaBaseId: string): Promise<void> {
  await deleteDoc(doc(db, "planillas_base_tp", planillaBaseId));
}

export async function inicializarPlanillasBase(): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;

  const usuarioSnap = await getDoc(doc(db, "usuarios", uid));
  if (usuarioSnap.data()?.rol !== "admin") return;

  const marcaRef = doc(db, "planillas_base_tp", "_inicializacion_bases");
  const marcaSnap = await getDoc(marcaRef);
  if (marcaSnap.exists()) return;

  await Promise.all(
    planillasBaseIniciales.map(async (base) => {
      const ref = doc(db, "planillas_base_tp", base.id);
      const snap = await getDoc(ref);
      if (snap.exists()) return;

      await setDoc(ref, {
        nombre: base.nombre,
        descripcion: null,
        tipo: base.tipo,
        columnas: base.columnas,
        filasBase: base.filasBase ?? [],
        activa: true,
        creadaPor: uid,
        actualizadaPor: uid,
        fechaCreacion: serverTimestamp(),
        fechaActualizacion: serverTimestamp(),
      });
    }),
  );

  await setDoc(marcaRef, {
    activa: false,
    tipo: "config",
    descripcion: "Marca interna para no duplicar bases iniciales.",
    fechaCreacion: serverTimestamp(),
    actualizadaPor: uid,
  });
}

export async function obtenerPlanillasPorContexto(params: ContextoPlanillasParams): Promise<PlanillaTP[]> {
  const constraints = [where("seccionId", "==", params.seccionId)];
  if (params.moduloId !== undefined) constraints.push(where("moduloId", "==", params.moduloId));
  if (params.subseccionPath !== undefined) {
    constraints.push(where("subseccionPath", "==", params.subseccionPath ?? null));
  }

  const snap = await getDocs(query(collection(db, "planillas_tp"), ...constraints));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PlanillaTP);
}

export async function obtenerPlanillasPorAlumno(params: AlumnoPlanillasParams): Promise<PlanillaTP[]> {
  const constraints = [
    where("alumnoId", "==", params.alumnoId),
    where("seccionId", "==", params.seccionId),
  ];
  if (params.moduloId !== undefined) constraints.push(where("moduloId", "==", params.moduloId));
  if (params.subseccionPath !== undefined) {
    constraints.push(where("subseccionPath", "==", params.subseccionPath ?? null));
  }

  const snap = await getDocs(query(collection(db, "planillas_tp"), ...constraints));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PlanillaTP);
}

export async function obtenerVistaAlumnoPlanilla(
  planillaId: string,
  alumnoId: string,
): Promise<VistaAlumnoPlanilla | null> {
  const snap = await getDoc(doc(db, "vistas_planillas_alumnos", alumnoId, "planillas", planillaId));
  return snap.exists() ? (snap.data() as VistaAlumnoPlanilla) : null;
}

export async function obtenerVistasAlumnoPorContexto(
  params: VistaAlumnoContextoParams,
): Promise<VistaAlumnoPlanilla[]> {
  const constraints = [where("seccionId", "==", params.seccionId)];
  if (params.moduloId !== undefined) constraints.push(where("moduloId", "==", params.moduloId));
  if (params.subseccionPath !== undefined) {
    constraints.push(where("subseccionPath", "==", params.subseccionPath ?? null));
  }

  const snap = await getDocs(
    query(collection(db, "vistas_planillas_alumnos", params.alumnoId, "planillas"), ...constraints),
  );
  return snap.docs.map((d) => d.data() as VistaAlumnoPlanilla);
}

export async function obtenerPlanillaPorId(planillaId: string): Promise<PlanillaTP | null> {
  const snap = await getDoc(doc(db, "planillas_tp", planillaId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as PlanillaTP) : null;
}

export async function obtenerFilasPlanilla(planillaId: string): Promise<FilaPlanilla[]> {
  const snap = await getDocs(collection(db, "planillas_tp", planillaId, "filas"));
  return ordenarFilas(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as FilaPlanilla));
}

export async function crearFilaPlanilla(planillaId: string, data: FilaPlanillaInput): Promise<string> {
  const ref = await addDoc(collection(db, "planillas_tp", planillaId, "filas"), {
    orden: data.orden,
    celdas: data.celdas,
    fechaCreacion: serverTimestamp(),
    fechaActualizacion: serverTimestamp(),
  });

  await touchPlanilla(planillaId);
  await generarVistaAlumno(planillaId);
  return ref.id;
}

export async function actualizarFilaPlanilla(
  planillaId: string,
  filaId: string,
  data: Partial<FilaPlanillaInput>,
): Promise<void> {
  await updateDoc(doc(db, "planillas_tp", planillaId, "filas", filaId), {
    ...data,
    fechaActualizacion: serverTimestamp(),
  });

  await touchPlanilla(planillaId);
  await generarVistaAlumno(planillaId);
}

export async function eliminarFilaPlanilla(planillaId: string, filaId: string): Promise<void> {
  await deleteDoc(doc(db, "planillas_tp", planillaId, "filas", filaId));
  await touchPlanilla(planillaId);
  await generarVistaAlumno(planillaId);
}

export async function actualizarColumnasPlanilla(
  planillaId: string,
  columnas: ColumnaPlanilla[],
): Promise<void> {
  const uid = getCurrentUserId();
  await updateDoc(doc(db, "planillas_tp", planillaId), {
    columnas: ordenarColumnas(columnas),
    actualizadoPor: uid,
    fechaActualizacion: serverTimestamp(),
  });

  await generarVistaAlumno(planillaId);
}

export async function actualizarDatosPlanilla(
  planillaId: string,
  data: DatosPlanillaInput,
): Promise<void> {
  const uid = getCurrentUserId();
  await updateDoc(doc(db, "planillas_tp", planillaId), {
    ...data,
    actualizadoPor: uid,
    fechaActualizacion: serverTimestamp(),
  });

  await generarVistaAlumno(planillaId);
}

export async function eliminarPlanilla(planillaId: string): Promise<void> {
  const planilla = await obtenerPlanillaPorId(planillaId);
  const filasSnap = await getDocs(collection(db, "planillas_tp", planillaId, "filas"));
  const vistasSnap = await getDocs(collection(db, "planillas_tp", planillaId, "vistas_alumno"));
  const batch = writeBatch(db);

  filasSnap.docs.forEach((fila) => batch.delete(fila.ref));
  vistasSnap.docs.forEach((vista) => batch.delete(vista.ref));
  if (planilla?.alumnoId) {
    batch.delete(doc(db, "vistas_planillas_alumnos", planilla.alumnoId, "planillas", planillaId));
  }
  batch.delete(doc(db, "planillas_tp", planillaId));

  await batch.commit();
}

export async function generarVistaAlumno(planillaId: string): Promise<void> {
  const planilla = await obtenerPlanillaPorId(planillaId);
  if (!planilla) throw new Error("Planilla no encontrada");

  const filas = await obtenerFilasPlanilla(planillaId);
  const columnasVisibles = ordenarColumnas(
    (planilla.columnas ?? []).filter((col) => col.visibleAlumno === true),
  );
  const columnasVisiblesIds = new Set(columnasVisibles.map((col) => col.id));

  const filasVisibles = filas.map((fila) => {
    const celdasVisibles: Record<string, any> = {};
    Object.entries(fila.celdas ?? {}).forEach(([columnaId, valor]) => {
      if (columnasVisiblesIds.has(columnaId)) {
        celdasVisibles[columnaId] = valor;
      }
    });

    return {
      id: fila.id,
      orden: fila.orden,
      celdas: celdasVisibles,
    };
  });

  const vistaData = {
    planillaId,
    alumnoId: planilla.alumnoId,
    alumnoNombre: planilla.alumnoNombre ?? null,
    titulo: planilla.titulo,
    tipo: planilla.tipo,
    moduloId: planilla.moduloId ?? null,
    seccionId: planilla.seccionId,
    subseccionPath: planilla.subseccionPath ?? null,
    columnasVisibles,
    filasVisibles,
    fechaActualizacion: serverTimestamp(),
  };

  await Promise.all([
    setDoc(doc(db, "planillas_tp", planillaId, "vistas_alumno", planilla.alumnoId), vistaData),
    setDoc(doc(db, "vistas_planillas_alumnos", planilla.alumnoId, "planillas", planillaId), vistaData),
  ]);
}

async function touchPlanilla(planillaId: string): Promise<void> {
  const uid = getCurrentUserId();
  await updateDoc(doc(db, "planillas_tp", planillaId), {
    actualizadoPor: uid,
    fechaActualizacion: serverTimestamp(),
  });
}
