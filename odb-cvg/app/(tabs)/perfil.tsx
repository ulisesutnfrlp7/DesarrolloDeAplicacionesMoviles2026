//app/(tabs)/perfil.tsx
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import ModalAlerta from "../../components/ui/ModalAlerta";
import ModalConfirmacion from "../../components/ui/ModalConfirmacion";
import { useUserProfile } from "../../hooks/useUserProfile";
import { useUserRole } from "../../hooks/useUserRole";

export default function PerfilScreen() {
  const { rol, loading: loadingRol } = useUserRole();
  const {
    perfil,
    loading: loadingPerfil,
    completarDatosFijos,
    actualizarDatosEditables,
  } = useUserProfile();

  // Datos fijos (legajo/DNI) — solo se usan si todavía no están cargados
  const [legajo, setLegajo] = useState("");
  const [legajoConfirmacion, setLegajoConfirmacion] = useState("");
  const [dni, setDni] = useState("");
  const [dniConfirmacion, setDniConfirmacion] = useState("");
  const [errorFijos, setErrorFijos] = useState("");
  const [guardandoFijos, setGuardandoFijos] = useState(false);

  // Datos editables (nombre/teléfono)
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [errorEditables, setErrorEditables] = useState("");
  const [guardandoEditables, setGuardandoEditables] = useState(false);
  const [confirmarEdicion, setConfirmarEdicion] = useState(false);

  const [alerta, setAlerta] = useState(false);

  useEffect(() => {
    setNombre(perfil.nombre ?? "");
    setTelefono(perfil.telefono ?? "");
  }, [perfil]);

  const esAlumno = rol === "alumno";

  const handleGuardarFijos = async () => {
    setErrorFijos("");
    setGuardandoFijos(true);
    try {
      await completarDatosFijos({ legajo, legajoConfirmacion, dni, dniConfirmacion });
      setAlerta(true);
    } catch (e: any) {
      setErrorFijos(e.message ?? "No se pudo guardar el legajo.");
    } finally {
      setGuardandoFijos(false);
    }
  };

  const handleGuardarEditables = async () => {
    setErrorEditables("");
    if (!nombre.trim()) {
      setErrorEditables("El nombre y apellido no puede quedar vacío.");
      return;
    }
    setGuardandoEditables(true);
    try {
      await actualizarDatosEditables({ nombre, telefono });
      setAlerta(true);
    } catch (e: any) {
      setErrorEditables(e.message ?? "No se pudo guardar los cambios.");
    } finally {
      setGuardandoEditables(false);
    }
  };

  if (loadingRol || loadingPerfil) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#25B471" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.titulo}>Mi Perfil</Text>

      <Text style={styles.label}>Nombre y Apellido</Text>
      <TextInput
        style={styles.input}
        value={nombre}
        onChangeText={setNombre}
        placeholder="Ej: Juan Pérez"
        placeholderTextColor="#9CA3AF"
      />

      <Text style={styles.label}>Teléfono</Text>
      <TextInput
        style={styles.input}
        value={telefono}
        onChangeText={setTelefono}
        placeholder="Ej: 221 555-5555"
        keyboardType="phone-pad"
        placeholderTextColor="#9CA3AF"
      />

      {errorEditables ? <Text style={styles.error}>{errorEditables}</Text> : null}

      <TouchableOpacity
        style={[styles.boton, guardandoEditables && { opacity: 0.7 }]}
        onPress={() => setConfirmarEdicion(true)}
        disabled={guardandoEditables}
      >
        {guardandoEditables ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.botonTexto}>Guardar cambios</Text>
        )}
      </TouchableOpacity>

      {esAlumno && (
        <>
          <View style={styles.separador} />
          <Text style={styles.subtituloSeccion}>Datos académicos</Text>

          {perfil.legajoBloqueado ? (
            <>
              <Text style={styles.label}>Legajo</Text>
              <View style={styles.campoBloqueado}>
                <Text style={styles.campoBloqueadoTexto}>{perfil.legajo}</Text>
              </View>

              <Text style={styles.label}>DNI</Text>
              <View style={styles.campoBloqueado}>
                <Text style={styles.campoBloqueadoTexto}>
                  {perfil.dniBloqueado ? perfil.dni : "No cargado"}
                </Text>
              </View>
            </>
          ) : (
            <>
              <View style={styles.avisoBox}>
                <Text style={styles.avisoTexto}>
                  ⚠️ Una vez guardados, el legajo y el DNI no se pueden modificar. Revisá bien antes de continuar.
                </Text>
              </View>

              <Text style={styles.label}>Legajo *</Text>
              <TextInput
                style={styles.input}
                value={legajo}
                onChangeText={setLegajo}
                placeholder="Ej: 12345/6"
                placeholderTextColor="#9CA3AF"
              />

              <Text style={styles.label}>Repetir legajo *</Text>
              <TextInput
                style={styles.input}
                value={legajoConfirmacion}
                onChangeText={setLegajoConfirmacion}
                placeholder="Volvé a escribirlo"
                placeholderTextColor="#9CA3AF"
              />

              <Text style={styles.label}>DNI (opcional)</Text>
              <TextInput
                style={styles.input}
                value={dni}
                onChangeText={setDni}
                placeholder="Ej: 30123456"
                keyboardType="number-pad"
                placeholderTextColor="#9CA3AF"
              />

              <Text style={styles.label}>DNI (opcional)</Text>
              <TextInput
                style={styles.input}
                value={dni}
                onChangeText={setDni}
                placeholder="Ej: 30123456"
                keyboardType="number-pad"
                placeholderTextColor="#9CA3AF"
              />

              {dni ? (
                <>
                  <Text style={styles.label}>Repetir DNI</Text>
                  <TextInput
                    style={styles.input}
                    value={dniConfirmacion}
                    onChangeText={setDniConfirmacion}
                    placeholder="Volvé a escribirlo"
                    keyboardType="number-pad"
                    placeholderTextColor="#9CA3AF"
                  />
                </>
              ) : null}

              {errorFijos ? <Text style={styles.error}>{errorFijos}</Text> : null}

              <TouchableOpacity
                style={[styles.boton, guardandoFijos && { opacity: 0.7 }]}
                onPress={handleGuardarFijos}
                disabled={guardandoFijos}
              >
                {guardandoFijos ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.botonTexto}>Guardar legajo</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </>
      )}

      <ModalConfirmacion
        visible={confirmarEdicion}
        titulo="Confirmar cambios"
        mensaje="Tu nombre y apellido funcionan como tu identificación dentro del sistema. ¿Estás seguro de que querés guardar estos cambios?"
        textoConfirmar="Sí, guardar"
        textoCancelar="Cancelar"
        onConfirm={() => {
          setConfirmarEdicion(false);
          handleGuardarEditables();
        }}
        onCancel={() => setConfirmarEdicion(false)}
      />

      <ModalAlerta
        visible={alerta}
        titulo="Guardado"
        mensaje="Tus datos fueron actualizados correctamente."
        tipo="exito"
        onClose={() => setAlerta(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F5" },
  content: { padding: 20, paddingTop: 48 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  titulo: { fontSize: 22, fontWeight: "bold", color: "#11181C", marginBottom: 20 },
  subtituloSeccion: { fontSize: 15, fontWeight: "700", color: "#374151", marginBottom: 14 },
  label: { fontSize: 14, fontWeight: "700", color: "#000000", marginBottom: 8 },
  input: {
    backgroundColor: "#F9F9F9",
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 8,
    paddingHorizontal: 12,
    minHeight: 48,
    marginBottom: 20,
    fontSize: 16,
    color: "#000",
  },
  campoBloqueado: {
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    paddingHorizontal: 12,
    minHeight: 48,
    justifyContent: "center",
    marginBottom: 20,
  },
  campoBloqueadoTexto: { fontSize: 16, color: "#6B7280" },
  separador: { height: 1, backgroundColor: "#E5E7EB", marginVertical: 12 },
  avisoBox: { backgroundColor: "#FEF3C7", borderRadius: 8, padding: 10, marginBottom: 16 },
  avisoTexto: { fontSize: 12, color: "#92400E", lineHeight: 17 },
  error: { color: "#DC2626", fontSize: 13, marginBottom: 12, textAlign: "center" },
  boton: { backgroundColor: "#25B471", borderRadius: 8, minHeight: 48, justifyContent: "center", alignItems: "center" },
  botonTexto: { color: "#FFFFFF", fontWeight: "bold", fontSize: 16 },
});