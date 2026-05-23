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

type Rol = 'alumno' | 'profesor' | 'admin';

interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
}

interface CursadaRestringida {
  id: string;      // seccionId
  moduloId: string;
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
  const [usuarioAEliminarId, setUsuarioAEliminarId] = useState<string | null>(null);
  const [usuarioActual, setUsuarioActual] = useState<Usuario | null>(null);
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [rol, setRol] = useState<Rol>('alumno');
  const [esAdmin, setEsAdmin] = useState(false);
  const [alerta, setAlerta] = useState<{
    visible: boolean; titulo: string; mensaje: string; tipo: 'error' | 'exito';
  }>({ visible: false, titulo: '', mensaje: '', tipo: 'exito' });

  // ─── Estado Cursadas ─────────────────────────────────────────────────────
  const [cursadas, setCursadas] = useState<CursadaRestringida[]>([]);
  const [loadingCursadas, setLoadingCursadas] = useState(true);
  const [cursadaExpandida, setCursadaExpandida] = useState<CursadaRestringida | null>(null);
  const [cursadaARegenerear, setCursadaARegenerar] = useState<CursadaRestringida | null>(null);
  const [regenerando, setRegenerando] = useState(false);
  const [modalAsignar, setModalAsignar] = useState(false);
  const [asignando, setAsignando] = useState(false);
  const { inscripciones: inscripcionesExpandida, loading: loadingInscripciones } =
    useInscripcionesPorSeccion(cursadaExpandida?.id ?? null);

  const rootNavigationState = useRootNavigationState();

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

  // Cargar cursadas restringidas via collectionGroup
  useEffect(() => {
    const q = query(
      collectionGroup(db, 'secciones'),
      where('esRestringida', '==', true),
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setCursadas(snapshot.docs.map(d => ({
        id: d.id,
        moduloId: d.ref.parent.parent?.id ?? '',
        titulo: d.data().titulo ?? '',
        codigoAcceso: d.data().codigoAcceso ?? '',
      })));
      setLoadingCursadas(false);
    }, () => setLoadingCursadas(false));
    return () => unsubscribe();
  }, []);

  // Mapa uid→nombre para mostrar en inscripciones
  const usuariosMap: Record<string, string> = {};
  usuarios.forEach(u => { usuariosMap[u.id] = u.nombre || u.email; });

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

  const confirmarEliminar = async () => {
    if (!usuarioAEliminarId) return;
    try {
      await deleteDoc(doc(db, 'usuarios', usuarioAEliminarId));
      setUsuarios(prev => prev.filter(u => u.id !== usuarioAEliminarId));
      setUsuarioAEliminarId(null);
      setAlerta({ visible: true, titulo: 'Eliminado', mensaje: 'El usuario fue eliminado.', tipo: 'exito' });
    } catch {
      setAlerta({ visible: true, titulo: 'Error', mensaje: 'No se pudo eliminar el usuario.', tipo: 'error' });
    }
  };

  const handleRegenerarCodigo = async () => {
    if (!cursadaARegenerear) return;
    setRegenerando(true);
    try {
      await regenerarCodigo(cursadaARegenerear.moduloId, cursadaARegenerear.id);
      setCursadaARegenerar(null);
      setAlerta({ visible: true, titulo: 'Código regenerado', mensaje: 'El nuevo código está activo. Todos los alumnos anteriores perdieron acceso.', tipo: 'exito' });
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

  const handleAsignarAlumno = async (alumnoId: string) => {
    if (!cursadaExpandida) return;
    setAsignando(true);
    try {
      await inscribirManualmente(cursadaExpandida.moduloId, cursadaExpandida.id, alumnoId);
      setModalAsignar(false);
      setAlerta({ visible: true, titulo: 'Alumno asignado', mensaje: 'El alumno fue inscripto manualmente en la cursada.', tipo: 'exito' });
    } catch (e: any) {
      setAlerta({ visible: true, titulo: 'Error', mensaje: e.message || 'No se pudo asignar al alumno.', tipo: 'error' });
    } finally {
      setAsignando(false);
    }
  };

  const renderBadge = (r: Rol) => {
    if (r === 'admin') return (
      <View style={[styles.badge, styles.badgeAdmin]}>
        <Text style={styles.badgeTextAdmin}>Admin</Text>
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
          <Text style={[styles.tabBtnText, tabActiva === 'cursadas' && styles.tabBtnTextActive]}>Cursadas</Text>
        </TouchableOpacity>
      </View>

      {/* ─── Pestaña Usuarios ─────────────────────────────────────────────── */}
      {tabActiva === 'usuarios' && (
        <View style={styles.container}>
          <FlatList
            data={usuarios}
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
                  <TouchableOpacity style={styles.deleteBtn} onPress={() => setUsuarioAEliminarId(item.id)}>
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
          {loadingCursadas ? (
            <ActivityIndicator color="#25B471" style={{ marginTop: 32 }} />
          ) : cursadas.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="school-outline" size={48} color="#CBD5E0" />
              <Text style={styles.emptyText}>No hay cursadas con acceso restringido.</Text>
              <Text style={[styles.emptyText, { fontSize: 12, marginTop: 4 }]}>
                Activá el control de acceso al editar una sección "Cursada - XXXX".
              </Text>
            </View>
          ) : (
            cursadas.map((cursada) => {
              const expandida = cursadaExpandida?.id === cursada.id;
              const inscritos = expandida ? inscripcionesExpandida : [];
              const alumnosSinInscribir = usuarios.filter(u =>
                u.rol === 'alumno' && !inscritos.some(i => i.alumnoId === u.id)
              );

              return (
                <View key={cursada.id} style={styles.cursadaCard}>
                  <TouchableOpacity
                    style={styles.cursadaCardHeader}
                    onPress={() => setCursadaExpandida(expandida ? null : cursada)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.cursadaIconBg}>
                      <Ionicons name="school-outline" size={20} color="#0F4A32" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cursadaTitulo}>{cursada.titulo}</Text>
                      <Text style={styles.cursadaSubtitulo}>Módulo: {cursada.moduloId}</Text>
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
                          onPress={() => setModalAsignar(true)}
                        >
                          <Ionicons name="person-add-outline" size={14} color="#0F4A32" />
                          <Text style={styles.asignarBtnText}>Asignar</Text>
                        </TouchableOpacity>
                      </View>

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
                            <TouchableOpacity
                              style={styles.revocarBtn}
                              onPress={() => handleRevocarInscripcion(insc)}
                            >
                              <Ionicons name="close-circle-outline" size={18} color="#DC2626" />
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
                            {alumnosSinInscribir.length === 0 ? (
                              <Text style={[styles.emptyText, { marginTop: 16 }]}>
                                Todos los alumnos ya están inscriptos.
                              </Text>
                            ) : (
                              <ScrollView style={{ maxHeight: 320 }}>
                                {alumnosSinInscribir.map(u => (
                                  <TouchableOpacity
                                    key={u.id}
                                    style={styles.alumnoPickerRow}
                                    onPress={() => handleAsignarAlumno(u.id)}
                                    disabled={asignando}
                                  >
                                    <View style={styles.alumnoPickerIcon}>
                                      <Ionicons name="person-outline" size={16} color="#0F4A32" />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                      <Text style={styles.alumnoPickerNombre}>{u.nombre}</Text>
                                      <Text style={styles.alumnoPickerEmail}>{u.email}</Text>
                                    </View>
                                    {asignando ? (
                                      <ActivityIndicator size="small" color="#25B471" />
                                    ) : (
                                      <Ionicons name="add-circle-outline" size={20} color="#25B471" />
                                    )}
                                  </TouchableOpacity>
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
            />

            <Text style={styles.inputLabel}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="correo@ejemplo.com"
              placeholderTextColor="#9CA3AF"
              keyboardType="email-address"
              autoCapitalize="none"
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
        visible={usuarioAEliminarId !== null}
        titulo="Eliminar usuario"
        mensaje="¿Estás seguro de eliminar este usuario? Esta acción es permanente."
        textoConfirmar="Eliminar"
        textoCancelar="Cancelar"
        onConfirm={confirmarEliminar}
        onCancel={() => setUsuarioAEliminarId(null)}
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
  inscriptoNombre: { fontSize: 14, fontWeight: '600', color: '#11181C' },
  inscriptoMeta: { flexDirection: 'row', gap: 6, marginTop: 3 },
  tipoBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  tipoBadgeCodigo: { backgroundColor: '#EFF6FF' },
  tipoBadgeManual: { backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#BBF7D0' },
  tipoBadgeText: { fontSize: 10, fontWeight: '700', color: '#374151' },
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
    fontSize: 15, color: '#11181C',
  },
  rolesContainer: { flexDirection: 'row', gap: 10, marginTop: 4 },
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