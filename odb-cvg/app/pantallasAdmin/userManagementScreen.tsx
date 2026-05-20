import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { router, useRootNavigationState } from 'expo-router';

import ModalConfirmacion from '../../components/ui/ModalConfirmacion';
import { auth, db } from '../../config/firebaseConfig';

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  updateDoc,
} from 'firebase/firestore';

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

  const [modalVisible, setModalVisible] = useState(false);
  const [usuarioAEliminarId, setUsuarioAEliminarId] = useState<string | null>(null);

  const [usuarioActual, setUsuarioActual] = useState<Usuario | null>(null);

  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [rol, setRol] = useState<Rol>('alumno');

  const [esAdmin, setEsAdmin] = useState(false);

  const rootNavigationState = useRootNavigationState();

  // =========================
  // VERIFICAR ROL + CARGAR USUARIOS
  // =========================

  useEffect(() => {

    if (!rootNavigationState?.key) return;

    const unsubscribe = auth.onAuthStateChanged(async (user) => {

      try {

        if (!user) {
          router.replace('/login');
          return;
        }

        const userRef = doc(db, 'usuarios', user.uid);

        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
          router.replace('/home');
          return;
        }

        const data = userSnap.data();

        if (data.rol !== 'admin') {
          router.replace('/home');
          return;
        }

        setEsAdmin(true);

        // =========================
        // CARGAR TODOS LOS USUARIOS
        // =========================

        const usuariosRef = collection(db, 'usuarios');

        const usuariosSnap = await getDocs(usuariosRef);

        const usuariosDB: Usuario[] = usuariosSnap.docs.map((doc) => ({
          id: doc.id,
          nombre: doc.data().nombre,
          email: doc.data().email,
          rol: doc.data().rol,
        }));

        setUsuarios(usuariosDB);

      } catch (error) {

        console.log(error);

        Alert.alert('Error', 'No se pudieron cargar los usuarios');

      } finally {

        setLoading(false);
      }

    });

    return unsubscribe;

  }, [rootNavigationState]);

  // =========================
  // ABRIR MODAL EDITAR
  // =========================

  const abrirEditar = (user: Usuario) => {

    setUsuarioActual(user);

    setNombre(user.nombre);

    setEmail(user.email);

    setRol(user.rol);

    setModalVisible(true);
  };

  // =========================
  // GUARDAR CAMBIOS
  // =========================

  const guardarCambios = async () => {

    if (!usuarioActual) return;

    try {

      const userRef = doc(db, 'usuarios', usuarioActual.id);

      await updateDoc(userRef, {
        nombre,
        email,
        rol,
      });

      setUsuarios((prev) =>
        prev.map((u) =>
          u.id === usuarioActual.id
            ? {
                ...u,
                nombre,
                email,
                rol,
              }
            : u
        )
      );

      setModalVisible(false);

      Alert.alert('Éxito', 'Usuario actualizado');

    } catch (error) {

      console.log(error);

      Alert.alert('Error', 'No se pudo actualizar el usuario');
    }
  };

  // =========================
  // ELIMINAR USUARIO
  // =========================

  const eliminarUsuario = (id: string) => {
    setUsuarioAEliminarId(id);
  };

  const confirmarEliminarUsuario = async () => {
    if (!usuarioAEliminarId) return;

    try {
      await deleteDoc(doc(db, 'usuarios', usuarioAEliminarId));

      setUsuarios((prev) => prev.filter((u) => u.id !== usuarioAEliminarId));
      setUsuarioAEliminarId(null);

      Alert.alert('Éxito', 'Usuario eliminado');
    } catch (error) {
      console.log(error);
      Alert.alert('Error', 'No se pudo eliminar');
    }
  };

  const cancelarEliminarUsuario = () => {
    setUsuarioAEliminarId(null);
  };

  // =========================
  // BADGES
  // =========================

  const renderBadge = (rol: Rol) => {

    if (rol === 'admin') {
      return (
        <View style={[styles.badge, styles.badgeAdmin]}>
          <Text style={styles.badgeTextAdmin}>Admin</Text>
        </View>
      );
    }

    if (rol === 'profesor') {
      return (
        <View style={[styles.badge, styles.badgeProfe]}>
          <Text style={styles.badgeTextProfe}>Profesor</Text>
        </View>
      );
    }

    return (
      <View style={[styles.badge, styles.badgeAlumno]}>
        <Text style={styles.badgeTextAlumno}>Alumno</Text>
      </View>
    );
  };

  // =========================
  // LOADING
  // =========================

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0F4A32" />
      </View>
    );
  }

  // =========================
  // SEGURIDAD EXTRA
  // =========================

  if (!esAdmin) {
    return null;
  }

  // =========================
  // RENDER
  // =========================

  return (
    <View style={styles.container}>

      <TouchableOpacity
        style={styles.homeButton}
        onPress={() => router.push('/home')}
      >
        <Ionicons name="home-sharp" size={20} color="#FFFFFF" />

        <Text style={styles.homeButtonText}>
          Inicio
        </Text>
      </TouchableOpacity>

      <Text style={styles.header}>
        Administración de Usuarios
      </Text>

      <FlatList
        data={usuarios}
        keyExtractor={(item) => item.id}

        renderItem={({ item }) => (

          <View style={styles.card}>

            <View style={{ flex: 1 }}>

              <Text style={styles.cardTitle}>
                {item.nombre}
              </Text>

              <Text style={styles.cardEmail}>
                {item.email}
              </Text>

              {renderBadge(item.rol)}

            </View>

            <View style={styles.actions}>

              <TouchableOpacity
                onPress={() => abrirEditar(item)}
              >
                <Text style={styles.edit}>
                  Editar
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => eliminarUsuario(item.id)}
              >
                <Text style={styles.delete}>
                  Eliminar
                </Text>
              </TouchableOpacity>

            </View>

          </View>
        )}
      />

      {/* ========================= */}
      {/* MODAL */}
      {/* ========================= */}

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
      >

        <View style={styles.modalContainer}>

          <View style={styles.modalContent}>

            <Text style={styles.modalTitle}>
              Editar Usuario
            </Text>

            <TextInput
              placeholder="Nombre"
              value={nombre}
              onChangeText={setNombre}
              style={styles.input}
            />

            <TextInput
              placeholder="Email"
              value={email}
              onChangeText={setEmail}
              style={styles.input}
            />

            <View style={styles.rolesContainer}>

              {['alumno', 'profesor', 'admin'].map((r) => (

                <TouchableOpacity
                  key={r}

                  style={[
                    styles.rolButton,
                    rol === r && styles.rolSeleccionado,
                  ]}

                  onPress={() => setRol(r as Rol)}
                >
                  <Text>{r}</Text>

                </TouchableOpacity>

              ))}

            </View>

            <TouchableOpacity
              style={styles.saveButton}
              onPress={guardarCambios}
            >
              <Text style={styles.saveText}>
                Guardar
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.cancel}>
                Cancelar
              </Text>
            </TouchableOpacity>

          </View>

        </View>

      </Modal>

      <ModalConfirmacion
        visible={usuarioAEliminarId !== null}
        titulo="Eliminar usuario"
        mensaje="¿Estás seguro de eliminar este usuario?"
        textoConfirmar="Eliminar"
        textoCancelar="Cancelar"
        onConfirm={confirmarEliminarUsuario}
        onCancel={cancelarEliminarUsuario}
      />

    </View>
  );
}

const styles = StyleSheet.create({

  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f0f4f8',
  },

  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  header: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#1a202c',
  },

  card: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 12,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    elevation: 3,
  },

  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },

  cardEmail: {
    color: '#718096',
    marginTop: 4,
  },

  actions: {
    justifyContent: 'space-around',
  },

  edit: {
    color: '#2b6cb0',
    fontWeight: 'bold',
  },

  delete: {
    color: 'red',
    fontWeight: 'bold',
  },

  badge: {
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },

  badgeAdmin: {
    backgroundColor: '#0F4A32',
  },

  badgeTextAdmin: {
    color: '#fff',
    fontSize: 12,
  },

  badgeProfe: {
    backgroundColor: '#E8F5E9',
  },

  badgeTextProfe: {
    color: '#0F4A32',
    fontSize: 12,
  },

  badgeAlumno: {
    backgroundColor: '#E2E8F0',
  },

  badgeTextAlumno: {
    color: '#1a202c',
    fontSize: 12,
  },

  modalContainer: {
    flex: 1,
    backgroundColor: '#00000088',
    justifyContent: 'center',
    padding: 20,
  },

  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
  },

  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },

  input: {
    borderWidth: 1,
    borderColor: '#CBD5E0',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },

  rolesContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },

  rolButton: {
    padding: 8,
    borderWidth: 1,
    borderColor: '#CBD5E0',
    borderRadius: 8,
  },

  rolSeleccionado: {
    backgroundColor: '#bee3f8',
  },

  saveButton: {
    backgroundColor: '#2b6cb0',
    padding: 12,
    borderRadius: 10,
  },

  saveText: {
    color: '#fff',
    textAlign: 'center',
    fontWeight: 'bold',
  },

  cancel: {
    textAlign: 'center',
    marginTop: 10,
    color: '#718096',
  },

  homeButton: {
    backgroundColor: '#0F4A32',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
    gap: 8,
    marginTop: 30,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 3,
  },

  homeButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
});