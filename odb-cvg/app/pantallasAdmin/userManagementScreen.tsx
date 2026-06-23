//app/pantallasAdmin/userManagementScreen.tsx
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useRootNavigationState } from 'expo-router';
import ModalConfirmacion from '../../components/ui/ModalConfirmacion';
import ModalAlerta from '../../components/ui/ModalAlerta';
import { auth, db } from '../../config/firebaseConfig';
import { collection, collectionGroup, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import ScreenHeader from '../../components/ui/ScreenHeader';
import { inscribirManualmente, revocarInscripcion, regenerarCodigo, useInscripcionesPorSeccion, type Inscripcion } from '../../hooks/useInscripciones';
import { useModulos } from '../../hooks/useModulos';
import { transferirPlanillasAlumnoAContexto } from '../../hooks/usePlanillas';
import { Background } from '@react-navigation/elements';

type Rol = 'alumno' | 'profesor' | 'admin';

interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
}

interface CursadaRestringida {
  id: string;
  moduloId: string;
  seccionId: string;
  seccionTitulo: string;
  subseccionPath?: string;
  subseccionTitulo?: string;
  tipoAcceso: "seccion" | "subseccion";
  titulo: string;
  codigoAcceso: string;
}


export default function UserManagementScreen() {
  // ─── Pestaña activa ──────────────────────────────────────────────────────
  const [tabActiva, setTabActiva] = useState<'usuarios' | 'cursadas'>('usuarios');

  // ─── Estado Usuarios ─────────────────────────────────────────────────────
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalEditar, setModalEditar] = useState(false);
  const [usuarioAEliminar, setUsuarioAEliminar] = useState<Usuario | null>(null);
  const [usuarioActual, setUsuarioActual] = useState<Usuario | null>(null);
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [rol, setRol] = useState<Rol>('alumno');
  const [esAdmin, setEsAdmin] = useState(false);
  const [alerta, setAlerta] = useState<{
    visible: boolean; titulo: string; mensaje: string; tipo: 'error' | 'exito';
  }>({ visible: false, titulo: '', mensaje: '', tipo: 'exito' });
  const [filtroTexto, setFiltroTexto] = useState("");
  const [filtroRol, setFiltroRol] = useState<Rol | "todos">("todos");
  const usuariosFiltrados = usuarios.filter((u) => {
  const coincideTexto =
    u.nombre.toLowerCase().includes(filtroTexto.toLowerCase()) ||
    u.email.toLowerCase().includes(filtroTexto.toLowerCase());
  const coincideRol = filtroRol === "todos" ? true : u.rol === filtroRol;
    return coincideTexto && coincideRol;
  });
  

  // ─── Estado Cursadas ─────────────────────────────────────────────────────
  const [cursadas, setCursadas] = useState<CursadaRestringida[]>([]);
  const [loadingCursadas, setLoadingCursadas] = useState(true);
  const [errorCursadas, setErrorCursadas] = useState<string | null>(null);
  const [cursadaExpandida, setCursadaExpandida] = useState<CursadaRestringida | null>(null);
  const [cursadaARegenerear, setCursadaARegenerar] = useState<CursadaRestringida | null>(null);
  const [regenerando, setRegenerando] = useState(false);
  const [modalAsignar, setModalAsignar] = useState(false);
  const [asignando, setAsignando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const { inscripciones: inscripcionesExpandida, loading: loadingInscripciones } =
    useInscripcionesPorSeccion(cursadaExpandida?.seccionId ?? null, cursadaExpandida?.subseccionPath ?? "");
  const { modulos, loading: loadingModulos } = useModulos();
  const [usuarioAEliminarNombre, setUsuarioAEliminarNombre] = useState<string | null>(null);
  const rootNavigationState = useRootNavigationState();
  const [filtroAccesos, setFiltroAccesos] = useState("");
  const [filtroTipoAcceso, setFiltroTipoAcceso] = useState<"todos" | "seccion" | "subseccion">("todos");
  const [inscripcionAMover, setInscripcionAMover] = useState<Inscripcion | null>(null);
  const [alumnoAMoverNombre, setAlumnoAMoverNombre] = useState("");
  const [destinoMovimiento, setDestinoMovimiento] = useState<CursadaRestringida | null>(null);
  const [transferirPlanillas, setTransferirPlanillas] = useState(true);
  const [moviendoAlumno, setMoviendoAlumno] = useState(false);
  const [alumnosSeleccionados, setAlumnosSeleccionados] = useState<string[]>([]);
  const [inscripcionesSeleccionadas, setInscripcionesSeleccionadas] = useState<string[]>([]);
  const [modalEliminarMultiples, setModalEliminarMultiples] = useState(false);
  const [cursadasUsuarioEliminar, setCursadasUsuarioEliminar] = useState<CursadaRestringida[]>([]);

  useEffect(() => {
    if (!rootNavigationState?.key) return;
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      try {
        if (!user) { router.replace('/login'); return; }
        const userSnap = await getDoc(doc(db, 'usuarios', user.uid));
        if (!userSnap.exists() || userSnap.data().rol !== 'admin') {
          router.replace('/(tabs)/home' as any); return;
        }
        setEsAdmin(true);
        const snap = await getDocs(collection(db, 'usuarios'));
        setUsuarios(snap.docs.map(d => ({
          id: d.id,
          nombre: d.data().nombre,
          email: d.data().email,
          rol: d.data().rol,
        })));
      } catch {
        setAlerta({ visible: true, titulo: 'Error', mensaje: 'No se pudieron cargar los usuarios.', tipo: 'error' });
      } finally {
        setLoading(false);
      }
    });
    return unsubscribe;
  }, [rootNavigationState]);

  // Cargar accesos restringidos de secciones y subsecciones.
  useEffect(() => {
    if (!esAdmin) return;

    setLoadingCursadas(true);
    setErrorCursadas(null);
    const cargarAccesos = async () => {
      try {
        const [seccionesSnap, subseccionesSnap] = await Promise.all([
          getDocs(query(collectionGroup(db, 'secciones'), where('esRestringida', '==', true))),
          getDocs(query(collectionGroup(db, 'subsecciones'), where('esRestringida', '==', true))),
        ]);

        const seccionesAccesos: CursadaRestringida[] = seccionesSnap.docs.map(d => {
          const moduloId = d.ref.parent.parent?.id ?? '';
          const data = d.data();
          return {
            id: d.id,
            moduloId,
            seccionId: d.id,
            seccionTitulo: data.titulo ?? '',
            tipoAcceso: 'seccion',
            titulo: data.titulo ?? '',
            codigoAcceso: data.codigoAcceso ?? '',
          };
        });

        const subseccionesAccesos: CursadaRestringida[] = await Promise.all(
          subseccionesSnap.docs.map(async d => {
            const path = d.ref.path.split('/');
            const moduloIndex = path.indexOf('modulos');
            const seccionIndex = path.indexOf('secciones');
            const moduloId = moduloIndex >= 0 ? path[moduloIndex + 1] : '';
            const seccionId = seccionIndex >= 0 ? path[seccionIndex + 1] : '';
            const subseccionPath = path
              .map((segment, index) => (segment === 'subsecciones' ? path[index + 1] : null))
              .filter((segment): segment is string => !!segment)
              .join('/');
            let seccionTitulo = '';
            try {
              const seccionSnap = await getDoc(doc(db, 'modulos', moduloId, 'secciones', seccionId));
              seccionTitulo = seccionSnap.exists() ? (seccionSnap.data().titulo ?? '') : '';
            } catch {}
            const data = d.data();
            return {
              id: `${seccionId}::${subseccionPath}`,
              moduloId,
              seccionId,
              seccionTitulo,
              subseccionPath,
              subseccionTitulo: data.titulo ?? '',
              tipoAcceso: 'subseccion',
              titulo: data.titulo ?? '',
              codigoAcceso: data.codigoAcceso ?? '',
            };
          }),
        );

        setCursadas([...seccionesAccesos, ...subseccionesAccesos].sort((a, b) => a.titulo.localeCompare(b.titulo)));
      } catch (error) {
        console.log('accesos restringidos error:', error);
        setErrorCursadas('No se pudieron cargar los accesos restringidos. Si acabás de agregar índices, esperá a que Firestore termine de crearlos.');
        setCursadas([]);
      } finally {
        setLoadingCursadas(false);
      }
    };
    cargarAccesos();
  }, [esAdmin]);

  const confirmarEliminar = async () => {
  if (!usuarioAEliminar) return;

  try {
    // 1. Eliminar al usuario
    await eliminarUsuario(usuarioAEliminar);

    // 2. Eliminar todas las inscripciones del usuario
    if (cursadasUsuarioEliminar.length > 0) {
      for (const cursada of cursadasUsuarioEliminar) {
        await eliminarInscripcion(cursada.moduloId, cursada.seccionId, usuarioAEliminar.id);
      }
    }

    // 3. Mostrar alerta de éxito
    setAlerta({
      visible: true,
      titulo: "Usuario eliminado",
      mensaje: `Se eliminó a ${usuarioAEliminar?.nombre} y sus ${cursadasUsuarioEliminar.length} inscripciones.`,
      tipo: "exito",
    });
  } catch (e: any) {
    setAlerta({
      visible: true,
      titulo: "Error",
      mensaje: e.message || "No se pudo eliminar al usuario y sus inscripciones.",
      tipo: "error",
    });
  } finally {
    setUsuarioAEliminar(null);
    setUsuarioAEliminarNombre(null);
  }
  };

  const eliminarUsuario = async (usuario: Usuario) => {
    try {
      const usuarioRef = doc(db, "usuarios", usuario.id);
      await deleteDoc(usuarioRef);
      console.log(`Usuario ${usuario.id} eliminado correctamente`);
    } catch (error) {
      console.error("Error eliminando usuario:", error);
      throw error;
    }
  };

  const eliminarInscripcion = async (moduloId: string, cursadaId: string, alumnoId: string) => {
    try {
      // Suponiendo que las inscripciones están en:
      // cursadas/{cursadaId}/inscripciones/{alumnoId}
      const inscripcionRef = doc(db, "cursadas", cursadaId, "inscripciones", alumnoId);
      await deleteDoc(inscripcionRef);
      console.log(`Inscripción de ${alumnoId} en cursada ${cursadaId} eliminada`);
    } catch (error) {
      console.error("Error eliminando inscripción:", error);
      throw error;
    }
  };
  // Mapa uid→nombre para mostrar en inscripciones
  const usuariosMap: Record<string, string> = {};
  usuarios.forEach(u => { usuariosMap[u.id] = u.nombre || u.email; });

  const modulosMap: Record<string, string> = {};
  modulos.forEach(m => { modulosMap[m.id] = m.titulo; });

  const cursadasFiltradas = cursadas.filter((acceso) => {
    const moduloTitulo = modulosMap[acceso.moduloId] ?? "";
    const texto = `${acceso.titulo} ${moduloTitulo} ${acceso.seccionTitulo} ${acceso.subseccionTitulo ?? ""}`.toLowerCase();
    const coincideTexto = !filtroAccesos.trim() || texto.includes(filtroAccesos.toLowerCase().trim());
    const coincideTipo = filtroTipoAcceso === "todos" || acceso.tipoAcceso === filtroTipoAcceso;
    return coincideTexto && coincideTipo;
  });

  const abrirEditar = (user: Usuario) => {
    setUsuarioActual(user);
    setNombre(user.nombre);
    setEmail(user.email);
    setRol(user.rol);
    setModalEditar(true);
  };

  const guardarCambios = async () => {
    if (!usuarioActual) return;
    try {
      await updateDoc(doc(db, 'usuarios', usuarioActual.id), { nombre, email, rol });
      setUsuarios(prev => prev.map(u =>
        u.id === usuarioActual.id ? { ...u, nombre, email, rol } : u
      ));
      setModalEditar(false);
      setAlerta({ visible: true, titulo: 'Guardado', mensaje: 'El usuario fue actualizado correctamente.', tipo: 'exito' });
    } catch {
      setAlerta({ visible: true, titulo: 'Error', mensaje: 'No se pudo actualizar el usuario.', tipo: 'error' });
    }
  };

  const handleRegenerarCodigo = async () => {
    if (!cursadaARegenerear) return;
    setRegenerando(true);
    try {
      await regenerarCodigo(
        cursadaARegenerear.moduloId,
        cursadaARegenerear.seccionId,
        cursadaARegenerear.subseccionPath,
      );
      setCursadaARegenerar(null);
      setAlerta({ visible: true, titulo: 'Código regenerado', mensaje: 'El nuevo código está activo. Los alumnos anteriores perdieron acceso.', tipo: 'exito' });
    } catch {
      setAlerta({ visible: true, titulo: 'Error', mensaje: 'No se pudo regenerar el código.', tipo: 'error' });
    } finally {
      setRegenerando(false);
    }
  };

  const handleRevocarInscripcion = async (insc: Inscripcion) => {
    try {
      await revocarInscripcion(insc.id);
    } catch {
      setAlerta({ visible: true, titulo: 'Error', mensaje: 'No se pudo revocar el acceso.', tipo: 'error' });
    }
  };

  //Funcion para marcar/desmarcar a un alumno en la lista de asignación
  const toggleAlumno = (id: string) => {
    setAlumnosSeleccionados(prev =>
      prev.includes(id)
        ? prev.filter(a => a !== id)
        : [...prev, id]
    );
  };

  //Funcion para marcar/desmarcar a un alumno en la lista de inscriptos
  const toggleInscripcion = (id: string) => {
    setInscripcionesSeleccionadas(prev =>
      prev.includes(id)
        ? prev.filter(i => i !== id)
        : [...prev, id]
    );
  };

  const handleAsignarMultiples = async () => {
    console.log("Alumnos:", alumnosSeleccionados);

    if (!cursadaExpandida) return;
    setAsignando(true);
    try {
      await Promise.all(
        alumnosSeleccionados.map(alumnoId =>
          inscribirManualmente( cursadaExpandida.moduloId, cursadaExpandida.seccionId, alumnoId , cursadaExpandida.subseccionPath))
      );
      setAlumnosSeleccionados([]);
      setModalAsignar(false);
      setAlerta({ visible: true, titulo: `Alumnos asignados (${alumnosSeleccionados.length})`, mensaje: "Los alumnos fueron asignados correctamente.", tipo: "exito" });
    } catch {
      setAlerta({ visible: true, titulo: "Error", mensaje: "No se pudieron asignar algunos alumnos.", tipo: "error" });
    } finally {
      setAsignando(false);
    }
  };


const handleEliminarMultiples = async () => {
  console.log("Seleccionadas:", inscripcionesSeleccionadas);
  if (!inscripcionesSeleccionadas.length) return;
  setEliminando(true);
  try {
    await Promise.all(
      inscripcionesSeleccionadas.map(id => revocarInscripcion(id))
    );
    setInscripcionesSeleccionadas([]);
    setModalEliminarMultiples(false);
    setAlerta({ visible: true, titulo: `Alumnos eliminados (${inscripcionesSeleccionadas.length})`, mensaje: "Los alumnos fueron eliminados correctamente.", tipo: "exito" });
  } catch {
    setAlerta({ visible: true, titulo: "Error", mensaje: "No se pudieron eliminar algunos alumnos.", tipo: "error" });
  } finally {
    setEliminando(false);
  }
};

const abrirMoverAlumno = (insc: Inscripcion) => {
  setInscripcionAMover(insc);
  setAlumnoAMoverNombre(usuariosMap[insc.alumnoId] || "Alumno");
  setDestinoMovimiento(null);
  setTransferirPlanillas(true);
};

const destinosMovimiento = cursadas.filter((acceso) =>
  cursadaExpandida?.tipoAcceso === "subseccion" &&
  acceso.tipoAcceso === "subseccion" &&
  acceso.moduloId === cursadaExpandida.moduloId &&
  acceso.seccionId === cursadaExpandida.seccionId &&
  acceso.id !== cursadaExpandida.id
);

  const confirmarMoverAlumno = async () => {
    if (!inscripcionAMover || !cursadaExpandida || !destinoMovimiento) return;
    setMoviendoAlumno(true);
    try {
      await inscribirManualmente(
        destinoMovimiento.moduloId,
        destinoMovimiento.seccionId,
        inscripcionAMover.alumnoId,
        destinoMovimiento.subseccionPath,
      );

      let planillasTransferidas = 0;
      if (transferirPlanillas) {
        planillasTransferidas = await transferirPlanillasAlumnoAContexto({
          alumnoId: inscripcionAMover.alumnoId,
          moduloId: cursadaExpandida.moduloId,
          seccionId: cursadaExpandida.seccionId,
          origenSubseccionPath: cursadaExpandida.subseccionPath,
          destinoSubseccionPath: destinoMovimiento.subseccionPath,
        });
      }

      await revocarInscripcion(inscripcionAMover.id);
      setInscripcionAMover(null);
      setDestinoMovimiento(null);
      setAlerta({
        visible: true,
        titulo: "Alumno movido",
        mensaje: `${alumnoAMoverNombre} fue movido a ${destinoMovimiento.titulo}.${transferirPlanillas ? ` Planillas transferidas: ${planillasTransferidas}.` : ""}`,
        tipo: "exito",
      });
    } catch (e: any) {
      setAlerta({
        visible: true,
        titulo: "Error",
        mensaje: e?.message || "No se pudo mover al alumno.",
        tipo: "error",
      });
    } finally {
      setMoviendoAlumno(false);
    }
  };

  const renderBadge = (r: Rol) => {
    if (r === 'admin') return (
      <View style={[styles.badge, styles.badgeAdmin]}>
        <Text style={styles.badgeTextAdmin}>Administrador</Text>
      </View>
    );
    if (r === 'profesor') return (
      <View style={[styles.badge, styles.badgeProfe]}>
        <Text style={styles.badgeTextProfe}>Profesor</Text>
      </View>
    );
    return (
      <View style={[styles.badge, styles.badgeAlumno]}>
        <Text style={styles.badgeTextAlumno}>Alumno</Text>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#F5F5F5" }}>
        <ScreenHeader titulo="Usuarios" mostrarHome />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#25B471" />
        </View>
      </View>
    );
  }

  if (!esAdmin) return null;

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader titulo="Administración" mostrarHome />

      {/* ─── Selector de pestañas ─────────────────────────────────────────── */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabBtn, tabActiva === 'usuarios' && styles.tabBtnActive]}
          onPress={() => setTabActiva('usuarios')}
        >
          <Ionicons name="people-outline" size={16} color={tabActiva === 'usuarios' ? '#0F4A32' : '#9CA3AF'} />
          <Text style={[styles.tabBtnText, tabActiva === 'usuarios' && styles.tabBtnTextActive]}>Usuarios</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tabActiva === 'cursadas' && styles.tabBtnActive]}
          onPress={() => setTabActiva('cursadas')}
        >
          <Ionicons name="school-outline" size={16} color={tabActiva === 'cursadas' ? '#0F4A32' : '#9CA3AF'} />
          <Text style={[styles.tabBtnText, tabActiva === 'cursadas' && styles.tabBtnTextActive]}>Accesos</Text>
        </TouchableOpacity>
      </View>

      {/* ─── Pestaña Usuarios ─────────────────────────────────────────────── */}
      {tabActiva === 'usuarios' && (
        <View style={styles.container}>
          {/* Buscador */}
          <TextInput
            style={styles.input}
            placeholder="Buscar por nombre o email..."
            value={filtroTexto}
            onChangeText={setFiltroTexto}
            autoCorrect={true}
            autoCapitalize="sentences"
          />
          {/* Botones de rol */}
          <View style={styles.rolesContainer}>
            {["todos", "alumno", "profesor", "admin"].map((rol) => {
            const activo = filtroRol === rol;
            return (
            <TouchableOpacity
              key={rol}
              style={[styles.rolButton, filtroRol === rol && styles.rolButtonActivo]}
              onPress={() => setFiltroRol(rol as Rol | "todos")}
            >
              <Text style={activo ? styles.rolButtonTextActivo : styles.rolButtonText}>{rol.toUpperCase()}</Text>
            </TouchableOpacity>
              )})}
          </View>
          <FlatList
            data={usuariosFiltrados}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="people-outline" size={48} color="#CBD5E0" />
                <Text style={styles.emptyText}>No hay usuarios registrados.</Text>
              </View>
            }
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={styles.cardInfo}>
                  <Text style={styles.cardNombre}>{item.nombre}</Text>
                  <Text style={styles.cardEmail}>{item.email}</Text>
                  {renderBadge(item.rol)}
                </View>
                <View style={styles.cardActions}>
                  <TouchableOpacity style={styles.editBtn} onPress={() => abrirEditar(item)}>
                    <Ionicons name="pencil-outline" size={16} color="#0F4A32" />
                    <Text style={styles.editBtnText}>Editar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.deleteBtn} onPress={() => confirmarEliminar()}>
                    <Ionicons name="trash-outline" size={16} color="#DC2626" />
                    <Text style={styles.deleteBtnText}>Eliminar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          />
        </View>
      )}

      {/* ─── Pestaña Cursadas ─────────────────────────────────────────────── */}
      {tabActiva === 'cursadas' && (
        <ScrollView style={styles.container} contentContainerStyle={styles.listContent}>
          <TextInput
            style={styles.buscadorInput}
            placeholder="Buscar por modulo, seccion o subseccion..."
            value={filtroAccesos}
            onChangeText={setFiltroAccesos}
            autoCorrect={true}
            autoCapitalize="sentences"
          />
          <View style={styles.rolesContainer}>
            {[
              { id: "todos", label: "TODOS" },
              { id: "seccion", label: "SECCIONES" },
              { id: "subseccion", label: "SUBSECCIONES" },
            ].map((filtro) => {
              const activo = filtroTipoAcceso === filtro.id;
              return (
                <TouchableOpacity
                  key={filtro.id}
                  style={[styles.rolButton, activo && styles.rolButtonActivo]}
                  onPress={() => setFiltroTipoAcceso(filtro.id as typeof filtroTipoAcceso)}
                >
                  <Text style={activo ? styles.rolButtonTextActivo : styles.rolButtonText}>{filtro.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {loadingCursadas ? (
            <ActivityIndicator color="#25B471" style={{ marginTop: 32 }} />
          ) : errorCursadas ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="alert-circle-outline" size={48} color="#F59E0B" />
              <Text style={styles.emptyText}>No se pudieron cargar los accesos.</Text>
              <Text style={[styles.emptyText, { fontSize: 12, marginTop: 4 }]}>
                {errorCursadas}
              </Text>
            </View>
          ) : cursadasFiltradas.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="school-outline" size={48} color="#CBD5E0" />
              <Text style={styles.emptyText}>No hay accesos restringidos.</Text>
              <Text style={[styles.emptyText, { fontSize: 12, marginTop: 4 }]}>
                Activá el control de acceso al crear o editar una sección o subsección para verla en este listado.
              </Text>
            </View>
          ) : (
            cursadasFiltradas.map((cursada) => {
              const expandida = cursadaExpandida?.id === cursada.id;
              const inscritos = expandida ? inscripcionesExpandida : [];
              const moduloTitulo = loadingModulos
                ? 'Cargando módulo...'
                : (modulosMap[cursada.moduloId] ?? 'Módulo no encontrado');
              const alumnosSinInscribir = usuarios.filter(u =>
                u.rol === 'alumno' && !inscritos.some(i => i.alumnoId === u.id)
              );
              const alumnosFiltrados = alumnosSinInscribir.filter(u =>
                u.nombre.toLowerCase().includes(filtroTexto.toLowerCase()) ||
                u.email.toLowerCase().includes(filtroTexto.toLowerCase())
              );

              return (
                <View key={cursada.id} style={styles.cursadaCard}>
                  <TouchableOpacity
                    style={styles.cursadaCardHeader}
                    onPress={() => {
                      setInscripcionesSeleccionadas([]);
                      setAlumnosSeleccionados([]);
                      setCursadaExpandida(
                        cursadaExpandida?.id === cursada.id
                          ? null
                          : cursada
                      );
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={styles.cursadaIconBg}>
                      <Ionicons name="school-outline" size={20} color="#0F4A32" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cursadaTitulo}>{cursada.titulo}</Text>
                      {cursada.tipoAcceso === "subseccion" && (
                        <Text style={styles.cursadaSubtitulo}>Sección: {cursada.seccionTitulo || cursada.seccionId}</Text>
                      )}
                      <Text style={styles.cursadaSubtitulo}>
                        Tipo: {cursada.tipoAcceso === "subseccion" ? "Subsección" : "Sección"}
                      </Text>
                      <Text style={styles.cursadaSubtitulo}>Módulo: {moduloTitulo}</Text>
                    </View>
                    <Ionicons
                      name={expandida ? 'chevron-up-outline' : 'chevron-down-outline'}
                      size={18}
                      color="#9CA3AF"
                    />
                  </TouchableOpacity>

                  {expandida && (
                    <View style={styles.cursadaPanel}>
                      {/* Código actual */}
                      <Text style={styles.panelLabel}>Código de acceso</Text>
                      <View style={styles.codigoRow}>
                        <Text style={styles.codigoTexto}>{cursada.codigoAcceso || '—'}</Text>
                        <TouchableOpacity
                          style={styles.regenerarBtn}
                          onPress={() => setCursadaARegenerar(cursada)}
                        >
                          <Ionicons name="refresh-outline" size={14} color="#DC2626" />
                          <Text style={styles.regenerarBtnText}>Regenerar</Text>
                        </TouchableOpacity>
                      </View>
                      <Text style={styles.codigoHint}>
                        Al regenerar, todos los alumnos inscriptos perderán el acceso.
                      </Text>

                      {/* Lista de inscriptos */}
                      <View style={styles.inscriptosHeader}>
                        <Text style={styles.panelLabel}>
                          Inscriptos ({expandida ? inscritos.length : '…'})
                        </Text>
                        
                        <TouchableOpacity
                          style={styles.asignarBtn}
                          onPress={() => {
                            setAlumnosSeleccionados([]);  
                            setModalAsignar(true);
                          }}
                        >
                          <Ionicons name="person-add-outline" size={14} color="#0F4A32" />
                          <Text style={styles.asignarBtnText}>Asignar</Text>
                        </TouchableOpacity>
                      </View>
                      {inscripcionesSeleccionadas.length > 0 && (
                          <TouchableOpacity
                            style={styles.eliminarBtn}
                            onPress={() => setModalEliminarMultiples(true)}
                          >
                            <Ionicons
                              name="trash-outline"
                              size={18}
                              color="#FFFFFF"
                            />
                            <Text style={styles.eliminarBtnText}>
                              Eliminar ({inscripcionesSeleccionadas.length})
                            </Text>
                          </TouchableOpacity>
                        )}

                      {loadingInscripciones ? (
                        <ActivityIndicator color="#25B471" size="small" style={{ marginTop: 8 }} />
                      ) : inscritos.length === 0 ? (
                        <Text style={styles.emptyText}>Sin inscriptos aún.</Text>
                      ) : (
                        inscritos.map((insc) => (
                          <View key={insc.id} style={styles.inscriptoRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.inscriptoNombre}>
                                {usuariosMap[insc.alumnoId] || insc.alumnoId}
                              </Text>
                              <View style={styles.inscriptoMeta}>
                                <View style={[styles.tipoBadge, insc.tipo === 'manual' ? styles.tipoBadgeManual : styles.tipoBadgeCodigo]}>
                                  <Text style={styles.tipoBadgeText}>
                                    {insc.tipo === 'manual' ? 'Manual' : 'Código'}
                                  </Text>
                                </View>
                              </View>
                            </View>
                            {cursada.tipoAcceso === "subseccion" && (
                              <TouchableOpacity
                                style={styles.moverBtn}
                                onPress={() => abrirMoverAlumno(insc)}
                              >
                                <Ionicons name="swap-horizontal-outline" size={17} color="#0F4A32" />
                                <Text style={styles.moverBtnText}>Mover</Text>
                              </TouchableOpacity>
                            )}
                            <TouchableOpacity
                              style={styles.revocarBtn}
                              onPress={() => {
                                toggleInscripcion(insc.id)}}
                              >
                                <Ionicons
                                  name={
                                    inscripcionesSeleccionadas.includes(insc.id)
                                      ? "checkmark-circle"
                                      : "close-circle-outline"
                                  }
                                  size={22}
                                  color="#DC2626"
                                />
                            </TouchableOpacity>
                          </View>
                        ))
                      )}

                      {/* Modal asignar alumno */}
                      <Modal visible={modalAsignar} transparent animationType="slide">
                        <View style={styles.modalOverlay}>
                          <View style={styles.modalContent}>
                            <View style={styles.modalHeader}>
                              <Text style={styles.modalTitle}>Asignar alumno</Text>
                              <TouchableOpacity onPress={() => setModalAsignar(false)}>
                                <Ionicons name="close" size={22} color="#6B7280" />
                              </TouchableOpacity>
                            </View>
                            {/* Buscador */}
                            <TextInput
                              style={styles.buscadorInput}
                              placeholder="Buscar por nombre o email..."
                              value={filtroTexto}
                              onChangeText={setFiltroTexto}
                              autoCorrect={true}
                              autoCapitalize="sentences"
                            />
                            {alumnosFiltrados.length === 0 ? (
                              <Text style={[styles.emptyText, { marginTop: 16 }]}>
                                {alumnosSinInscribir.length === 0
                                  ? "Todos los alumnos ya están inscriptos."
                                  : "No se encontraron alumnos con ese criterio."}
                              </Text>
                            ) : (
                              <ScrollView style={{ maxHeight: 320 }}>
                                {alumnosSeleccionados.length > 0 && (
                                  <TouchableOpacity
                                    style={styles.saveBtn}
                                    onPress={handleAsignarMultiples}
                                  >
                                    <Text style={styles.saveBtnText}>
                                      Asignar ({alumnosSeleccionados.length})
                                    </Text>
                                  </TouchableOpacity>
                                )}
                                {alumnosFiltrados.map(u => (
                                  <View key={u.id} style={styles.alumnoPickerRow}>
                                    <View style={styles.alumnoPickerIcon}>
                                      <Ionicons name="person-outline" size={16} color="#0F4A32" />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                      <Text style={styles.alumnoPickerNombre}>{u.nombre}</Text>
                                      <Text style={styles.alumnoPickerEmail}>{u.email}</Text>
                                    </View>
                                    <TouchableOpacity
                                      onPress={() => toggleAlumno(u.id)}
                                    >
                                      <Ionicons
                                        name={ alumnosSeleccionados.includes(u.id)? "checkmark-circle": "add-circle-outline" } size={24} color="#25B471"
                                      />
                                    </TouchableOpacity>
                                  </View>
                                ))}
                              </ScrollView>
                            )}
                          </View>
                        </View>
                      </Modal>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      <Modal visible={inscripcionAMover !== null} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Mover alumno</Text>
              <TouchableOpacity
                onPress={() => {
                  if (!moviendoAlumno) {
                    setInscripcionAMover(null);
                    setDestinoMovimiento(null);
                  }
                }}
              >
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Origen</Text>
            <Text style={styles.moverResumen}>
              {alumnoAMoverNombre} desde {cursadaExpandida?.titulo ?? "este acceso"}
            </Text>

            <Text style={styles.inputLabel}>Destino</Text>
            {destinosMovimiento.length === 0 ? (
              <Text style={[styles.emptyText, { marginTop: 8 }]}>
                No hay otros accesos restringidos compatibles en esta sección.
              </Text>
            ) : (
              <ScrollView style={{ maxHeight: 260 }}>
                {destinosMovimiento.map((destino) => {
                  const selected = destinoMovimiento?.id === destino.id;
                  return (
                    <TouchableOpacity
                      key={destino.id}
                      style={[styles.destinoRow, selected && styles.destinoRowSelected]}
                      onPress={() => setDestinoMovimiento(destino)}
                      disabled={moviendoAlumno}
                      activeOpacity={0.85}
                    >
                      <View style={styles.alumnoPickerIcon}>
                        <Ionicons name="folder-outline" size={16} color="#0F4A32" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.alumnoPickerNombre}>{destino.titulo}</Text>
                        <Text style={styles.alumnoPickerEmail}>
                          {destino.seccionTitulo || "Misma sección"}
                        </Text>
                      </View>
                      {selected && <Ionicons name="checkmark-circle" size={20} color="#25B471" />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            <TouchableOpacity
              style={styles.transferToggle}
              onPress={() => setTransferirPlanillas((prev) => !prev)}
              activeOpacity={0.85}
              disabled={moviendoAlumno}
            >
              <Ionicons
                name={transferirPlanillas ? "checkbox-outline" : "square-outline"}
                size={21}
                color={transferirPlanillas ? "#0F4A32" : "#9CA3AF"}
              />
              <Text style={styles.transferToggleText}>
                Transferir planillas de trabajos prácticos al nuevo acceso
              </Text>
            </TouchableOpacity>

            <Text style={styles.codigoHint}>
              Las notas de exámenes quedan registradas donde fueron cargadas para docentes/admin, pero el alumno seguirá viéndolas en su historial personal.
            </Text>
            {destinoMovimiento && (
              <Text style={styles.confirmacionMovimiento}>
                ¿Querés mover a {alumnoAMoverNombre} de {cursadaExpandida?.titulo} a {destinoMovimiento.titulo}?
              </Text>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => {
                  setInscripcionAMover(null);
                  setDestinoMovimiento(null);
                }}
                disabled={moviendoAlumno}
              >
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.saveBtn,
                  (!destinoMovimiento || moviendoAlumno) && { opacity: 0.6 },
                ]}
                onPress={confirmarMoverAlumno}
                disabled={!destinoMovimiento || moviendoAlumno}
              >
                {moviendoAlumno ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveBtnText}>Mover</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Editar */}
      <Modal visible={modalEditar} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Editar Usuario</Text>
              <TouchableOpacity onPress={() => setModalEditar(false)}>
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Nombre</Text>
            <TextInput
              style={styles.input}
              value={nombre}
              onChangeText={setNombre}
              placeholder="Nombre completo"
              placeholderTextColor="#9CA3AF"
              autoCorrect={true}
              autoCapitalize="sentences"
            />

            <Text style={styles.inputLabel}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="correo@ejemplo.com"
              placeholderTextColor="#9CA3AF"
              keyboardType="email-address"
              autoCorrect={true}
              autoCapitalize="sentences"
            />

            <Text style={styles.inputLabel}>Rol</Text>
            <View style={styles.rolesContainer}>
              {(['alumno', 'profesor', 'admin'] as Rol[]).map(r => (
                <TouchableOpacity
                  key={r}
                  style={[styles.rolBtn, rol === r && styles.rolBtnSelected]}
                  onPress={() => setRol(r)}
                >
                  <Text style={[styles.rolBtnText, rol === r && styles.rolBtnTextSelected]}>
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalEditar(false)}>
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={guardarCambios}>
                <Text style={styles.saveBtnText}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ModalConfirmacion
        visible={modalEliminarMultiples}
        titulo="Eliminar alumnos"
        mensaje={`¿Deseás eliminar ${inscripcionesSeleccionadas.length} alumno(s)?`}
        textoConfirmar="Eliminar"
        textoCancelar="Cancelar"
        onConfirm={handleEliminarMultiples}
        onCancel={() => setModalEliminarMultiples(false)}
      />
      <ModalConfirmacion
        visible={cursadaARegenerear !== null}
        titulo="Regenerar código"
        mensaje={`¿Regenerar el código de "${cursadaARegenerear?.titulo}"?\n\nTodos los alumnos inscriptos perderán el acceso y deberán volver a ingresar con el nuevo código.`}
        textoConfirmar={regenerando ? 'Regenerando…' : 'Sí, regenerar'}
        textoCancelar="Cancelar"
        onConfirm={handleRegenerarCodigo}
        onCancel={() => setCursadaARegenerar(null)}
      />
      <ModalConfirmacion
        visible={usuarioAEliminar !== null}
        titulo="Eliminar usuario"
        mensaje={`${usuarioAEliminar?.nombre} tiene ${cursadasUsuarioEliminar.length} inscripciones a cursadas. ¿Seguro que querés eliminarlo igual?`}
        textoConfirmar="Eliminar de todos modos"
        textoCancelar="Cancelar"
        onConfirm={confirmarEliminar}
        onCancel={() => setUsuarioAEliminar(null)}
      />
       
      <ModalAlerta
        visible={alerta.visible}
        titulo={alerta.titulo}
        mensaje={alerta.mensaje}
        tipo={alerta.tipo}
        onClose={() => setAlerta(prev => ({ ...prev, visible: false }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: 16, paddingBottom: 40 },
  emptyContainer: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 14, color: '#9CA3AF', fontStyle: 'italic', textAlign: 'center' },

  // ─── Tabs ────────────────────────────────────────────────────────────────
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  tabBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 8, borderRadius: 10,
    backgroundColor: '#F3F4F6',
  },
  tabBtnActive: { backgroundColor: '#E8F5E9' },
  tabBtnText: { fontSize: 14, fontWeight: '600', color: '#9CA3AF' },
  tabBtnTextActive: { color: '#0F4A32' },

  // ─── Usuarios ────────────────────────────────────────────────────────────
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    borderLeftWidth: 3,
    borderLeftColor: '#25B471',
  },
  cardInfo: { flex: 1 },
  cardNombre: { fontSize: 15, fontWeight: '700', color: '#11181C' },
  cardEmail: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  cardActions: { gap: 10, alignItems: 'flex-end' },

  editBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#E8F5E9', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
  },
  editBtnText: { fontSize: 13, fontWeight: '600', color: '#0F4A32' },
  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FEF2F2', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
  },
  deleteBtnText: { fontSize: 13, fontWeight: '600', color: '#DC2626' },
  

  badge: { marginTop: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, alignSelf: 'flex-start' },
  badgeAdmin: { backgroundColor: '#0F4A32' },
  badgeTextAdmin: { color: '#FFFFFF', fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase' },
  badgeProfe: { backgroundColor: '#E8F5E9', borderWidth: 1, borderColor: '#25B471' },
  badgeTextProfe: { color: '#0F4A32', fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase' },
  badgeAlumno: { backgroundColor: '#E2E8F0' },
  badgeTextAlumno: { color: '#4A5568', fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase' },
  buscadorInput: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 8, paddingHorizontal: 12, minHeight: 44, fontSize: 14, color: '#11181C', letterSpacing: 0, marginBottom: 20 },
  rolesContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 , marginTop: 12  },
  rolButton: { flex: 1, marginHorizontal: 4, paddingVertical: 8, borderWidth: 1, borderColor: '#25B471', borderRadius: 8, alignItems: 'center', backgroundColor: '#FFFFFF'},
  rolButtonActivo: { backgroundColor: '#25B471'},
  rolButtonText: { fontSize: 13, fontWeight: '600', color: '#25B471'},
  rolButtonTextActivo: { color: '#FFFFFF'},

  // ─── Cursadas ─────────────────────────────────────────────────────────────
  cursadaCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    borderLeftWidth: 3,
    borderLeftColor: '#25B471',
  },
  cursadaCardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
  },
  cursadaIconBg: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center',
  },
  cursadaTitulo: { fontSize: 15, fontWeight: '700', color: '#11181C' },
  cursadaSubtitulo: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  cursadaPanel: {
    borderTopWidth: 1, borderTopColor: '#F3F4F6', padding: 14, gap: 4,
  },
  panelLabel: { fontSize: 11, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8, marginBottom: 6 },
  codigoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  codigoTexto: { fontSize: 22, fontWeight: '800', color: '#0F4A32', letterSpacing: 4 },
  regenerarBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FEF2F2', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
  },
  regenerarBtnText: { fontSize: 13, fontWeight: '600', color: '#DC2626' },
  codigoHint: { fontSize: 11, color: '#9CA3AF', marginBottom: 4 },
  inscriptosHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  asignarBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#E8F5E9', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
  },
  asignarBtnText: { fontSize: 13, fontWeight: '600', color: '#0F4A32' },
  inscriptoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F9F9F9',
  },
  eliminarBtn: {
    flex: 1, backgroundColor: '#DC2626', borderRadius: 12,
    paddingVertical: 4, alignItems: 'center',
  },
  eliminarBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  inscriptoNombre: { fontSize: 14, fontWeight: '600', color: '#11181C' },
  inscriptoMeta: { flexDirection: 'row', gap: 6, marginTop: 3 },
  tipoBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  tipoBadgeCodigo: { backgroundColor: '#EFF6FF' },
  tipoBadgeManual: { backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#BBF7D0' },
  tipoBadgeText: { fontSize: 10, fontWeight: '700', color: '#374151' },
  moverBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#E8F5E9', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 8,
  },
  moverBtnText: { fontSize: 12, fontWeight: '700', color: '#0F4A32' },
  revocarBtn: { padding: 4 },
  alumnoPickerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  alumnoPickerIcon: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center',
  },
  alumnoPickerNombre: { fontSize: 14, fontWeight: '600', color: '#11181C' },
  alumnoPickerEmail: { fontSize: 12, color: '#9CA3AF' },
  moverResumen: {
    fontSize: 14,
    color: '#374151',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 12,
  },
  destinoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 8,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
    borderRadius: 10,
  },
  destinoRowSelected: { backgroundColor: '#E8F5E9' },
  transferToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
  },
  transferToggleText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#374151' },
  confirmacionMovimiento: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: '700',
    color: '#0F4A32',
    lineHeight: 19,
  },

  // ─── Modal ────────────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1, backgroundColor: '#00000066',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 36,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#11181C' },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: '#F9F9F9', borderWidth: 1, borderColor: '#E5E7EB',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: '#11181C', letterSpacing: 0,
  },
  rolBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#E5E7EB',
    alignItems: 'center', backgroundColor: '#FFFFFF',
  },
  rolBtnSelected: { backgroundColor: '#0F4A32', borderColor: '#0F4A32' },
  rolBtnText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  rolBtnTextSelected: { color: '#FFFFFF' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  cancelBtn: {
    flex: 1, backgroundColor: '#FFFFFF', borderRadius: 12,
    borderWidth: 1.5, borderColor: '#E5E7EB',
    paddingVertical: 14, alignItems: 'center',
  },
  cancelBtnText: { color: '#6B7280', fontSize: 15, fontWeight: '700' },
  saveBtn: {
    flex: 1, backgroundColor: '#25B471', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
