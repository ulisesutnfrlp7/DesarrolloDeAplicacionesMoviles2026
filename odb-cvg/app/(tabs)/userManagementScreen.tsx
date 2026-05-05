import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert
} from 'react-native';

type Rol = 'alumno' | 'profesor' | 'admin';

interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
}

// DATA MOCK (después va a venir de Firebase)
const USUARIOS_INICIALES: Usuario[] = [
  { id: '1', nombre: 'Juan Perez', email: 'juan@test.com', rol: 'alumno' },
  { id: '2', nombre: 'Ana Gomez', email: 'ana@test.com', rol: 'profesor' },
];

export default function UserManagementScreen() {
  const [usuarios, setUsuarios] = useState(USUARIOS_INICIALES);
  const [modalVisible, setModalVisible] = useState(false);
  const [modoEdicion, setModoEdicion] = useState(false);
  const [usuarioActual, setUsuarioActual] = useState<Usuario | null>(null);

  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [rol, setRol] = useState<Rol>('alumno');

  const abrirCrear = () => {
    setModoEdicion(false);
    setNombre('');
    setEmail('');
    setRol('alumno');
    setModalVisible(true);
  };

  const abrirEditar = (user: Usuario) => {
    setModoEdicion(true);
    setUsuarioActual(user);
    setNombre(user.nombre);
    setEmail(user.email);
    setRol(user.rol);
    setModalVisible(true);
  };

  const guardarUsuario = () => {
    if (!nombre || !email) {
      Alert.alert('Error', 'Completa todos los campos');
      return;
    }

    if (modoEdicion && usuarioActual) {
      setUsuarios((prev) =>
        prev.map((u) =>
          u.id === usuarioActual.id ? { ...u, nombre, email, rol } : u
        )
      );
    } else {
      const nuevo: Usuario = {
        id: Date.now().toString(),
        nombre,
        email,
        rol,
      };
      setUsuarios((prev) => [...prev, nuevo]);
    }

    setModalVisible(false);
  };

  const eliminarUsuario = (id: string) => {
    Alert.alert('Confirmar', '¿Eliminar usuario?', [
      { text: 'Cancelar' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () => {
          setUsuarios((prev) => prev.filter((u) => u.id !== id));
        },
      },
    ]);
  };

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

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Administración de Usuarios</Text>

      <TouchableOpacity style={styles.addButton} onPress={abrirCrear}>
        <Text style={styles.addButtonText}>+ Agregar Usuario</Text>
      </TouchableOpacity>

      <FlatList
        data={usuarios}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{item.nombre}</Text>
              <Text style={styles.cardEmail}>{item.email}</Text>
              {renderBadge(item.rol)}
            </View>

            <View style={styles.actions}>
              <TouchableOpacity onPress={() => abrirEditar(item)}>
                <Text style={styles.edit}>Editar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => eliminarUsuario(item.id)}>
                <Text style={styles.delete}>Eliminar</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      {/* MODAL */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {modoEdicion ? 'Editar Usuario' : 'Nuevo Usuario'}
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

            {/* Selector de rol simple */}
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

            <TouchableOpacity style={styles.saveButton} onPress={guardarUsuario}>
              <Text style={styles.saveText}>Guardar</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Text style={styles.cancel}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f0f4f8' },

  header: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#1a202c'
  },

  addButton: {
    backgroundColor: '#2b6cb0',
    padding: 12,
    borderRadius: 10,
    marginBottom: 15,
  },

  addButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    textAlign: 'center',
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

  cardTitle: { fontSize: 16, fontWeight: 'bold' },
  cardEmail: { color: '#718096', marginTop: 4 },

  actions: {
    justifyContent: 'space-around',
  },

  edit: { color: '#2b6cb0', fontWeight: 'bold' },
  delete: { color: 'red', fontWeight: 'bold' },

  badge: {
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },

  badgeAdmin: { backgroundColor: '#0F4A32' },
  badgeTextAdmin: { color: '#fff', fontSize: 12 },

  badgeProfe: { backgroundColor: '#E8F5E9' },
  badgeTextProfe: { color: '#0F4A32', fontSize: 12 },

  badgeAlumno: { backgroundColor: '#E2E8F0' },
  badgeTextAlumno: { color: '#1a202c', fontSize: 12 },

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
});