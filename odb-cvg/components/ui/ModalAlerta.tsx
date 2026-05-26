// components/ui/ModalAlerta.tsx
import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface ModalAlertaProps {
  visible: boolean;
  titulo: string;
  mensaje: string;
  tipo?: 'error' | 'exito';
  onClose: () => void;
}

export default function ModalAlerta({ visible, titulo, mensaje, tipo = 'error', onClose }: ModalAlertaProps) {
  const colorBase = tipo === 'error' ? '#DC2626' : '#25B471';

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <Text style={[styles.titulo, { color: colorBase }]}>{titulo}</Text>
          <Text style={styles.mensaje}>{mensaje}</Text>
          
          <TouchableOpacity 
            style={[styles.boton, { backgroundColor: colorBase }]} 
            onPress={onClose}
          >
            <Text style={styles.textoBoton}>Entendido</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  titulo: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  mensaje: {
    fontSize: 16,
    color: '#4A5568',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  boton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
  },
  textoBoton: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
});