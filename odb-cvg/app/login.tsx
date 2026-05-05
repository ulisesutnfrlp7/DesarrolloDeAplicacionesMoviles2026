import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { router } from 'expo-router';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../config/firebaseConfig';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Por favor completá todos los campos.');
      return;
    }

    const mailFormateado = email.toLowerCase().trim();

    //  PRUEBA MIENTRAS ULI VUELVE (Borrar despues)
    if (mailFormateado === 'test@unlp.edu.ar' && password === '123456') {
      Alert.alert('Modo de Prueba', 'Ingresando con usuario temporal...');
      router.replace('/(tabs)/home' as any); 
      return;
    }

    try {
      await signInWithEmailAndPassword(auth, mailFormateado, password);
      router.replace('/(tabs)/home' as any);
    } catch (error: any) {
      Alert.alert('Acceso denegado', 'Credenciales incorrectas o Firebase no habilitado. Detalle: ' + error.message);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Operatoria Dental B</Text>
        <Text style={styles.subtitle}>Facultad de Odontología - UNLP</Text>
      </View>

      <View style={styles.formContainer}>
        <Text style={styles.label}>Correo Electrónico</Text>
        <TextInput style={styles.input} placeholder="Ej: alumno@unlp.edu.ar" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholderTextColor="#666" />
        
        <Text style={styles.label}>Contraseña</Text>
        <TextInput style={styles.input} placeholder="********" value={password} onChangeText={setPassword} secureTextEntry placeholderTextColor="#666" />

        <TouchableOpacity style={styles.primaryButton} onPress={handleLogin}>
          <Text style={styles.primaryButtonText}>Iniciar Sesión</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkButton} onPress={() => router.push('/recuperar')}>
          <Text style={styles.linkText}>¿Olvidaste tu contraseña?</Text>
        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push('/registro')}>
          <Text style={styles.secondaryButtonText}>Crear cuenta nueva</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5', justifyContent: 'center', padding: 20 },
  header: { marginBottom: 40, alignItems: 'center' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#0F4A32', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#000000', textAlign: 'center', fontWeight: '500' },
  formContainer: { backgroundColor: '#FFFFFF', padding: 20, borderRadius: 12, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5, elevation: 3 },
  label: { fontSize: 14, fontWeight: '700', color: '#000000', marginBottom: 8 },
  input: { backgroundColor: '#F9F9F9', borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 8, paddingHorizontal: 12, minHeight: 48, marginBottom: 20, fontSize: 16, color: '#000' },
  primaryButton: { backgroundColor: '#25B471', borderRadius: 8, alignItems: 'center', justifyContent: 'center', minHeight: 48, marginTop: 10 },
  primaryButtonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 16 },
  linkButton: { alignItems: 'center', marginTop: 15, minHeight: 48, justifyContent: 'center' },
  linkText: { color: '#0F4A32', fontSize: 14, fontWeight: '600' },
  divider: { height: 1, backgroundColor: '#E0E0E0', marginVertical: 20 },
  secondaryButton: { backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#25B471', borderRadius: 8, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  secondaryButtonText: { color: '#25B471', fontWeight: 'bold', fontSize: 16 },
});