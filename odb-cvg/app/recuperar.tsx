//app/recuperar.tsx
import { router } from 'expo-router';
import { sendPasswordResetEmail } from 'firebase/auth';
import { collection, getDocs, query, where } from 'firebase/firestore';
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import ModalAlerta from '../components/ui/ModalAlerta';
import { auth, db } from '../config/firebaseConfig';

export default function RecuperarScreen() {
  const [email, setEmail] = useState('');
  const [errorMensaje, setErrorMensaje] = useState('');
  const [modalExito, setModalExito] = useState(false);

  const handleRecuperar = async () => {
    setErrorMensaje('');
    const correoLimpiado = email.trim().toLowerCase();

    if (!correoLimpiado) {
      setErrorMensaje('Por favor ingresá tu correo electrónico.');
      return;
    }
    
    try {
      // 1. Verificar si el correo existe en la base de datos de Firestore
      const usuariosRef = collection(db, 'usuarios');
      const q = query(usuariosRef, where('email', '==', correoLimpiado));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        // Si no se encontró ningún documento con ese email
        setErrorMensaje('Este correo no está registrado en el sistema.');
        return;
      }

      // 2. Si existe, enviamos el correo de recuperación
      await sendPasswordResetEmail(auth, correoLimpiado);
      setModalExito(true);
    } catch (error: any) {
      if (error.code === 'auth/invalid-email') {
        setErrorMensaje('El formato del correo electrónico no es válido.');
      } else {
        setErrorMensaje('No se pudo enviar el correo de recuperación.');
      }
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Recuperar Contraseña</Text>
      <Text style={styles.subtitle}>Te enviaremos un enlace a tu correo institucional.</Text>

      <View style={styles.formContainer}>
        <Text style={styles.label}>Correo Electrónico</Text>
        <TextInput 
          style={[styles.input, errorMensaje ? styles.inputError : null]} 
          placeholder="Ej: alumno@unlp.edu.ar" 
          value={email} 
          onChangeText={(text) => { setEmail(text); setErrorMensaje(""); }} 
          keyboardType="email-address" 
          autoCapitalize="none" 
          placeholderTextColor="#666" 
        />

        {errorMensaje ? (
          <Text style={styles.errorText}>{errorMensaje}</Text>
        ) : null}

        <TouchableOpacity style={styles.primaryButton} onPress={handleRecuperar}>
          <Text style={styles.primaryButtonText}>Enviar Enlace</Text>
        </TouchableOpacity>

        <View style={styles.footerLinks}>
          <TouchableOpacity 
            style={styles.linkButton} 
            onPress={() => router.replace('/login' as any)}
          >
            <Text style={styles.linkText}>Volver al Inicio</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.linkButton} 
            onPress={() => router.push('/registro' as any)}
          >
            <Text style={styles.linkText}>Crear cuenta nueva</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ModalAlerta 
        visible={modalExito}
        titulo="Correo enviado"
        mensaje="Si el correo está registrado, recibirás un enlace para cambiar tu contraseña."
        tipo="exito"
        onClose={() => {
          setModalExito(false);
          router.back();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5', justifyContent: 'center', padding: 20 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#0F4A32', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#4A5568', textAlign: 'center', marginBottom: 40, fontWeight: '500', paddingHorizontal: 10 },
  formContainer: { backgroundColor: '#FFFFFF', padding: 20, borderRadius: 12, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5, elevation: 3 },
  label: { fontSize: 14, fontWeight: '700', color: '#000000', marginBottom: 8 },
  input: { backgroundColor: '#F9F9F9', borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 8, paddingHorizontal: 12, minHeight: 48, marginBottom: 20, fontSize: 16, color: '#000', letterSpacing: 0 },
  inputError: { borderColor: "#DC2626", backgroundColor: "#FEF2F2" },
  errorText: { color: "#DC2626", fontSize: 13, marginBottom: 12, marginTop: -8, textAlign: "center" },
  primaryButton: { backgroundColor: '#25B471', borderRadius: 8, alignItems: 'center', justifyContent: 'center', minHeight: 48, marginTop: 4 },
  primaryButtonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 16 },
  footerLinks: { marginTop: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  linkButton: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 5 },
  linkText: { color: '#0F4A32', fontSize: 14, fontWeight: '600' },
});
