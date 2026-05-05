//app/recuperar.tsx
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { router } from 'expo-router';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../config/firebaseConfig';

export default function RecuperarScreen() {
  const [email, setEmail] = useState('');

  const handleRecuperar = async () => {
    if (!email) {
      Alert.alert('Error', 'Por favor ingresá tu correo electrónico.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      Alert.alert('Correo enviado', 'Si el correo está registrado, recibirás un enlace para cambiar tu contraseña.');
      router.back(); //Para volver al login
    } catch (error: any) {
      Alert.alert('Error', 'No se pudo enviar el correo. Detalle: ' + error.message);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Recuperar Contraseña</Text>
      <Text style={styles.subtitle}>Te enviaremos un enlace a tu correo institucional.</Text>

      <View style={styles.formContainer}>
        <Text style={styles.label}>Correo Electrónico</Text>
        <TextInput style={styles.input} placeholder="Ej: alumno@unlp.edu.ar" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholderTextColor="#666" />

        <TouchableOpacity style={styles.primaryButton} onPress={handleRecuperar}>
          <Text style={styles.primaryButtonText}>Enviar Enlace</Text>
        </TouchableOpacity>

        <View style={styles.footerLinks}>
          {/* VOLVER AL LOGIN */}
          <TouchableOpacity 
            style={styles.linkButton} 
            onPress={() => router.replace('/login' as any)}
          >
            <Text style={styles.linkText}>Volver al Inicio</Text>
          </TouchableOpacity>

          {/* IR A REGISTRO */}
          <TouchableOpacity 
            style={styles.linkButton} 
            onPress={() => router.push('/registro' as any)}
          >
            <Text style={styles.linkText}>Crear cuenta nueva</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5', justifyContent: 'center', padding: 20 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#0F4A32', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#4A5568', textAlign: 'center', marginBottom: 40, fontWeight: '500' },
  formContainer: { backgroundColor: '#FFFFFF', padding: 20, borderRadius: 12, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5, elevation: 3 },
  label: { fontSize: 14, fontWeight: '700', color: '#000000', marginBottom: 8 },
  input: { backgroundColor: '#F9F9F9', borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 8, paddingHorizontal: 12, minHeight: 48, marginBottom: 20, fontSize: 16, color: '#000' },
  primaryButton: { backgroundColor: '#25B471', borderRadius: 8, alignItems: 'center', justifyContent: 'center', minHeight: 48, marginTop: 10 },
  primaryButtonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 16 },
  footerLinks: { marginTop: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  linkButton: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 5 },
  linkText: { color: '#0F4A32', fontSize: 14, fontWeight: '600' },
});