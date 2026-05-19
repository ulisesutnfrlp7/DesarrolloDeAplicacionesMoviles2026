import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../config/firebaseConfig';
import ModalConfirmacion from '../../components/ui/ModalConfirmacion';
import { Ionicons } from '@expo/vector-icons';

// Simulación para ver algo en pantalla (no sirve para despues)
const NIVELES_ODONTO = [
  { id: '1', año: '3ro', nivel: 'Nivel 1', estado: 'Aprobado' },
  { id: '2', año: '3ro', nivel: 'Nivel 2', estado: 'En curso' },
  { id: '3', año: '4to', nivel: 'Nivel 3', estado: 'Pendiente' },
  { id: '4', año: '4to', nivel: 'Nivel 4', estado: 'Pendiente' },
  { id: '5', año: '5to', nivel: 'Nivel 5', estado: 'Pendiente' },
  { id: '6', año: '5to', nivel: 'Nivel 6', estado: 'Pendiente' },
];

export default function HomeScreen() {
  const [niveles] = useState(NIVELES_ODONTO);
  const [modalVisible, setModalVisible] = useState(false);

  const [rolUsuario, setRolUsuario] = useState(''); 
  const [cargando, setCargando] = useState(true);
  console.log(auth.currentUser);
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const docRef = doc(db, 'usuarios', user.uid);
          const docSnap = await getDoc(docRef);
          
          if (docSnap.exists()) {
            setRolUsuario(docSnap.data().rol); // Setear 'alumno' (o lo que diga la BD)
          } else {
            console.log("No se encontró el documento del usuario");
          }
        } catch (error) {
          console.error("Error al obtener rol:", error);
        } finally {
          setCargando(false);
        }
      } else {
        setCargando(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleCerrarSesion = async () => {
    try {
      setModalVisible(false);
      await signOut(auth);
      router.replace('/login' as any);
    } catch (error: any) {
      Alert.alert('Aviso', 'Sesión cerrada localmente (Firebase arrojó error: ' + error.message + ')');
      router.replace('/login' as any);
    }
  };

  if (cargando) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#25B471" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.headerTitles}>
          <View style={styles.titleWithBadge}>
            <Text style={styles.headerText}>CVG - Odonto B</Text>
            
            {/*  CARTELITOS DE ROL PARA DIFERENCIA ENTRE LOS DISTINTOS TIPOS DE USUARIO */}
            {rolUsuario === 'admin' && (
              <View style={[styles.badge, styles.badgeAdmin]}>
                <Text style={styles.badgeTextAdmin}>Admin</Text>
              </View>
            )}
            {rolUsuario === 'profesor' && (
              <View style={[styles.badge, styles.badgeProfe]}>
                <Text style={styles.badgeTextProfe}>Profesor</Text>
              </View>
            )}
          </View>
          <Text style={styles.subHeaderText}>Facultad de Odontología UNLP</Text>
        </View>

        {/*Boton para ir a pantalla de administracion de usuarios, solo visible para admins*/}
        {rolUsuario === 'admin' && (
          <TouchableOpacity
            style={styles.adminButton}
            onPress={() => router.push('../pantallasAdmin/userManagementScreen')}
          >
            <Ionicons name="person" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
          </TouchableOpacity>
        )}
        
        <TouchableOpacity style={styles.logoutButton} onPress={() => setModalVisible(true)}>
          <Text style={styles.logoutButtonText}>Salir</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={niveles}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card}>
            <View>
              <Text style={styles.cardTitle}>{item.nivel} ({item.año} Año)</Text>
              <Text style={styles.cardStatus}>Estado: {item.estado}</Text>
            </View>
          </TouchableOpacity>
        )}
      />

      <ModalConfirmacion 
        visible={modalVisible}
        titulo="Cerrar Sesión"
        mensaje="¿Estás seguro de que deseas cerrar sesión? Tendrás que volver a ingresar tus credenciales la próxima vez."
        textoConfirmar="Sí, salir"
        textoCancelar="Cancelar"
        onConfirm={handleCerrarSesion}
        onCancel={() => setModalVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f0f4f8' },
  headerRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'flex-start',
    marginTop: 40,
    marginBottom: 25 
  },
  headerTitles: {
    flex: 1,
  },
  titleWithBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  headerText: { fontSize: 24, fontWeight: 'bold', color: '#1a202c' },
  
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeAdmin: {
    backgroundColor: '#0F4A32',
    borderWidth: 1,
    borderColor: '#0F4A32',
  },
  badgeTextAdmin: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  badgeProfe: {
    backgroundColor: '#E8F5E9',
    borderWidth: 1,
    borderColor: '#25B471',
  },
  badgeTextProfe: {
    color: '#0F4A32',
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },

  subHeaderText: { fontSize: 14, color: '#4a5568', marginTop: 4 },
  logoutButton: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 48,
    marginLeft: 10,
  },
  logoutButtonText: { color: '#4A5568', fontWeight: 'bold', fontSize: 14 },
  card: { backgroundColor: 'white', padding: 20, borderRadius: 12, marginBottom: 15, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 3 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#2b6cb0' },
  cardStatus: { fontSize: 15, color: '#718096', marginTop: 8 },

  adminButton: {
  backgroundColor: '#0F4A32',
  paddingVertical: 14,
  paddingHorizontal: 18,
  borderRadius: 12,
  marginBottom: 20,
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  shadowColor: '#000',
  shadowOpacity: 0.08,
  shadowRadius: 5,
  elevation: 3,
  },

  adminButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },

  

});