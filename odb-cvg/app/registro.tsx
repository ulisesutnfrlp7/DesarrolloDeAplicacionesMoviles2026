//app/registro.tsx
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebaseConfig';
import ModalAlerta from '../components/ui/ModalAlerta';

export default function RegistroScreen() {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [modalConfig, setModalConfig] = useState({ visible: false, titulo: '', mensaje: '', tipo: 'error' as 'error' | 'exito' });

  const mostrarModal = (titulo: string, mensaje: string, tipo: 'error' | 'exito') => {
    setModalConfig({ visible: true, titulo, mensaje, tipo });
  };

  const handleRegistro = async () => {
    if (!nombre || !email || !password) {
      mostrarModal('Campos incompletos', 'Por favor completá todos los datos solicitados.', 'error');
      return;
    }
    
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const user = userCredential.user;

      await setDoc(doc(db, 'usuarios', user.uid), {
        nombre: nombre,
        email: email.trim(),
        rol: 'alumno',
        fechaRegistro: new Date()
      });

      mostrarModal('¡Cuenta Creada!', 'Te registraste exitosamente.', 'exito');
      setTimeout(() => {
        setModalConfig({ ...modalConfig, visible: false });
        router.replace('/(tabs)/home' as any);
      }, 1500);

    } catch (error: any) {
      let mensajeError = 'Ocurrió un error inesperado. Intentá nuevamente.';
      if (error.code === 'auth/email-already-in-use') {
        mensajeError = 'Este correo ya está registrado. Por favor, iniciá sesión.';
      } else if (error.code === 'auth/weak-password') {
        mensajeError = 'La contraseña es muy débil. Debe tener al menos 6 caracteres.';
      } else if (error.code === 'auth/invalid-email') {
        mensajeError = 'El formato del correo electrónico no es válido.';
      }

      mostrarModal('Error al registrarse', mensajeError, 'error');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Crear Cuenta</Text>
      <Text style={styles.subtitle}>Completa tus datos para ingresar al CVG.</Text>

      <View style={styles.formContainer}>
        <Text style={styles.label}>Nombre y Apellido</Text>
        <TextInput style={styles.input} placeholder="Ej: Juan Perez" value={nombre} onChangeText={setNombre} placeholderTextColor="#666" />

        <Text style={styles.label}>Correo Electrónico</Text>
        <TextInput style={styles.input} placeholder="Ej: alumno@unlp.edu.ar" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholderTextColor="#666" />
        
        <Text style={styles.label}>Contraseña</Text>
        <TextInput style={styles.input} placeholder="Mínimo 6 caracteres" value={password} onChangeText={setPassword} secureTextEntry placeholderTextColor="#666" />

        <TouchableOpacity style={styles.primaryButton} onPress={handleRegistro}>
          <Text style={styles.primaryButtonText}>Registrarme</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.linkButton} 
          onPress={() => router.replace('/login' as any)}
        >
          <Text style={styles.linkText}>¿Ya tenés cuenta? Iniciá sesión</Text>
        </TouchableOpacity>
      </View>
    <ModalAlerta 
        visible={modalConfig.visible}
        titulo={modalConfig.titulo}
        mensaje={modalConfig.mensaje}
        tipo={modalConfig.tipo}
        onClose={() => setModalConfig({ ...modalConfig, visible: false })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5', justifyContent: 'center', padding: 20 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#0F4A32', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#4A5568', textAlign: 'center', marginBottom: 40, fontWeight: '500' },
  linkButton: { alignItems: 'center', marginTop: 20, minHeight: 48, justifyContent: 'center' },
  linkText: { color: '#0F4A32', fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
  formContainer: { backgroundColor: '#FFFFFF', padding: 20, borderRadius: 12, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5, elevation: 3 },
  label: { fontSize: 14, fontWeight: '700', color: '#000000', marginBottom: 8 },
  input: { backgroundColor: '#F9F9F9', borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 8, paddingHorizontal: 12, minHeight: 48, marginBottom: 20, fontSize: 16, color: '#000' },
  primaryButton: { backgroundColor: '#25B471', borderRadius: 8, alignItems: 'center', justifyContent: 'center', minHeight: 48, marginTop: 10 },
  primaryButtonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 16 },
});