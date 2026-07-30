//app/(tabs)/perfil.tsx
import React, { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,} from "react-native";
import ModalAlerta from "../../components/ui/ModalAlerta";
import ModalConfirmacion from "../../components/ui/ModalConfirmacion";
import { useUserProfile } from "../../hooks/useUserProfile";
import { useUserRole } from "../../hooks/useUserRole";
import ModalCambiarPassword from "../../components/ui/ModalCambiarPassword";
import { getPushDiagnostics, getPushPreference, registerCurrentDeviceForPush, setPushEnabled, type PushDiagnostics } from "../../hooks/usePushNotifications";

export default function PerfilScreen() {
  const { rol, loading: loadingRol } = useUserRole();
  const {
  perfil,
  loading: loadingPerfil,
  completarDatosFijos,
  completarDNI,
  actualizarDatosEditables,
} = useUserProfile();

  // Datos fijos (legajo/DNI) — solo se usan si todavía no están cargados
  const [legajo, setLegajo] = useState("");
  const [legajoConfirmacion, setLegajoConfirmacion] = useState("");
  const [dni, setDni] = useState("");
  const [dniConfirmacion, setDniConfirmacion] = useState("");
  const [errorFijos, setErrorFijos] = useState("");
  const [guardandoFijos, setGuardandoFijos] = useState(false);

  // Datos para cargar el DNI después, cuando el legajo ya está guardado
  const [dniPosterior, setDniPosterior] = useState("");
  const [dniPosteriorConfirmacion, setDniPosteriorConfirmacion] = useState("");
  const [errorDniPosterior, setErrorDniPosterior] = useState("");
  const [guardandoDniPosterior, setGuardandoDniPosterior] = useState(false);
  const [confirmarDni, setConfirmarDni] = useState(false);

  // Datos editables (nombre/teléfono)
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [errorEditables, setErrorEditables] = useState("");
  const [guardandoEditables, setGuardandoEditables] = useState(false);
  const [confirmarEdicion, setConfirmarEdicion] = useState(false);

  const [alerta, setAlerta] = useState(false);

  const [modalPassword, setModalPassword] = useState(false);
  const [pushEnabled, setPushEnabledState] = useState(true);
  const [guardandoPush, setGuardandoPush] = useState(false);
  const [pushError, setPushError] = useState("");
  const [pushDiagnostics, setPushDiagnostics] = useState<PushDiagnostics | null>(null);

  useEffect(() => {
    setNombre(perfil.nombre ?? "");
    setTelefono(perfil.telefono ?? "");
  }, [perfil]);

  useEffect(() => {
    getPushPreference().then((pref) => {
      setPushEnabledState(pref.enabled);
      if (pref.error) setPushError(pref.error);
    });
  }, []);

  useEffect(() => {
    if (rol === "admin") {
      getPushDiagnostics().then(setPushDiagnostics).catch(() => setPushDiagnostics(null));
    }
  }, [rol]);

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

  const handleGuardarDNI = async () => {
    setErrorDniPosterior("");
    setGuardandoDniPosterior(true);
    try {
      await completarDNI(dniPosterior, dniPosteriorConfirmacion);
      setDniPosterior("");
      setDniPosteriorConfirmacion("");
      setAlerta(true);
    } catch (e: any) {
      setErrorDniPosterior(e.message ?? "No se pudo guardar el DNI.");
    } finally {
      setGuardandoDniPosterior(false);
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

  const handleTogglePush = async () => {
    setPushError("");
    setGuardandoPush(true);
    try {
      if (pushEnabled) {
        await setPushEnabled(false);
        setPushEnabledState(false);
      } else {
        await registerCurrentDeviceForPush();
        setPushEnabledState(true);
      }
    } catch (e: any) {
      setPushError(e.message ?? "No se pudo actualizar la configuracion de push.");
    } finally {
      setGuardandoPush(false);
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
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 0}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
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

      <View style={styles.separador} />
      <Text style={styles.subtituloSeccion}>Seguridad</Text>
      <TouchableOpacity style={styles.botonSecundario} onPress={() => setModalPassword(true)}>
        <Text style={styles.botonSecundarioTexto}>Actualizar contraseña</Text>
      </TouchableOpacity>

      <View style={styles.separador} />
      <Text style={styles.subtituloSeccion}>Notificaciones</Text>
      <View style={styles.pushBox}>
        <View style={{ flex: 1 }}>
          <Text style={styles.pushTitle}>Push del dispositivo</Text>
          <Text style={styles.pushText}>
            {pushEnabled
              ? "Activadas para avisos remotos. Las internas siguen disponibles siempre."
              : "Desactivadas. Vas a seguir viendo las notificaciones dentro de la app."}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.pushSwitch, pushEnabled && styles.pushSwitchOn, guardandoPush && { opacity: 0.6 }]}
          onPress={handleTogglePush}
          disabled={guardandoPush}
          activeOpacity={0.8}
        >
          <View style={[styles.pushKnob, pushEnabled && styles.pushKnobOn]} />
        </TouchableOpacity>
      </View>
      {pushError ? <Text style={styles.error}>{pushError}</Text> : null}

      {rol === "admin" && pushDiagnostics ? (
        <View style={styles.diagnosticsBox}>
          <Text style={styles.pushTitle}>Diagnostico push</Text>
          <Text style={styles.pushText}>Permiso local: {pushDiagnostics.permissionStatus}</Text>
          <Text style={styles.pushText}>ExpoPushToken: {pushDiagnostics.hasExpoPushToken ? `configurado (*${pushDiagnostics.tokenSuffix})` : "no disponible"}</Text>
          <Text style={styles.pushText}>Guardado en Firestore: {pushDiagnostics.storedInFirestore ? "si" : "no"}</Text>
          <Text style={styles.pushText}>Preferencia push: {pushDiagnostics.pushEnabled ? "habilitada" : "deshabilitada"}</Text>
        </View>
      ) : null}

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
              {perfil.dniBloqueado ? (
                <View style={styles.campoBloqueado}>
                  <Text style={styles.campoBloqueadoTexto}>{perfil.dni}</Text>
                </View>
              ) : (
                <>
                  <View style={styles.avisoBox}>
                    <Text style={styles.avisoTexto}>
                      ⚠️ Una vez guardado, el DNI no se puede modificar. Revisá bien antes de continuar.
                    </Text>
                  </View>

                  <TextInput
                    style={styles.input}
                    value={dniPosterior}
                    onChangeText={setDniPosterior}
                    placeholder="Ej: 30123456"
                    keyboardType="number-pad"
                    placeholderTextColor="#9CA3AF"
                  />

                  <Text style={styles.label}>Repetir DNI</Text>
                  <TextInput
                    style={styles.input}
                    value={dniPosteriorConfirmacion}
                    onChangeText={setDniPosteriorConfirmacion}
                    placeholder="Volvé a escribirlo"
                    keyboardType="number-pad"
                    placeholderTextColor="#9CA3AF"
                  />

                  {errorDniPosterior ? <Text style={styles.error}>{errorDniPosterior}</Text> : null}

                  <TouchableOpacity
                    style={[styles.boton, guardandoDniPosterior && { opacity: 0.7 }]}
                    onPress={() => setConfirmarDni(true)}
                    disabled={guardandoDniPosterior}
                  >
                    {guardandoDniPosterior ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.botonTexto}>Guardar DNI</Text>
                    )}
                  </TouchableOpacity>
                </>
              )}
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

      <ModalConfirmacion
        visible={confirmarDni}
        titulo="Confirmar DNI"
        mensaje="Una vez guardado, el DNI no se podrá modificar. ¿Estás seguro de que querés guardarlo?"
        textoConfirmar="Sí, guardar"
        textoCancelar="Cancelar"
        onConfirm={() => {
          setConfirmarDni(false);
          handleGuardarDNI();
        }}
        onCancel={() => setConfirmarDni(false)}
      />

      <ModalAlerta
        visible={alerta}
        titulo="Guardado"
        mensaje="Tus datos fueron actualizados correctamente."
        tipo="exito"
        onClose={() => setAlerta(false)}
      />

      <ModalCambiarPassword
        visible={modalPassword}
        onClose={() => setModalPassword(false)}
        onSuccess={() => setAlerta(true)}
      />
    </ScrollView>
    </KeyboardAvoidingView>
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
  botonSecundario: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#0F4A32",
    borderRadius: 8,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  botonSecundarioTexto: { color: "#0F4A32", fontWeight: "700", fontSize: 15 },
  campoBloqueadoTexto: { fontSize: 16, color: "#6B7280" },
  separador: { height: 1, backgroundColor: "#E5E7EB", marginVertical: 12 },
  avisoBox: { backgroundColor: "#FEF3C7", borderRadius: 8, padding: 10, marginBottom: 16 },
  avisoTexto: { fontSize: 12, color: "#92400E", lineHeight: 17 },
  error: { color: "#DC2626", fontSize: 13, marginBottom: 12, textAlign: "center" },
  boton: { backgroundColor: "#25B471", borderRadius: 8, minHeight: 48, justifyContent: "center", alignItems: "center" },
  botonTexto: { color: "#FFFFFF", fontWeight: "bold", fontSize: 16 },
  pushBox: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  pushTitle: { fontSize: 14, fontWeight: "700", color: "#11181C", marginBottom: 3 },
  pushText: { fontSize: 12, color: "#6B7280", lineHeight: 17 },
  pushSwitch: {
    width: 48,
    height: 28,
    borderRadius: 14,
    padding: 3,
    backgroundColor: "#CBD5E0",
    justifyContent: "center",
  },
  pushSwitchOn: { backgroundColor: "#25B471" },
  pushKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#FFFFFF",
  },
  pushKnobOn: { alignSelf: "flex-end" },
  diagnosticsBox: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D1FAE5",
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
});
