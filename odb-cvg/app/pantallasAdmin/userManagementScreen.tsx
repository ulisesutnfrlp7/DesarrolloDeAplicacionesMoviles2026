//app/pantallasAdmin/userManagementScreen.tsx
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View,} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useRootNavigationState } from 'expo-router';
import ModalConfirmacion from '../../components/ui/ModalConfirmacion';
import ModalAlerta from '../../components/ui/ModalAlerta';
import { auth, db } from '../../config/firebaseConfig';
import { collection, deleteDoc, doc, getDoc, getDocs, updateDoc } from 'firebase/firestore';
import ScreenHeader from '../../components/ui/ScreenHeader';

type Rol = 'alumno' | 'profesor' | 'admin';

interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
}

export default function UserManagementScreen() {
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
      <ScreenHeader titulo="Administración de Usuarios" mostrarHome />
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
  emptyText: { fontSize: 14, color: '#9CA3AF', fontStyle: 'italic' },

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

  // Modal
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