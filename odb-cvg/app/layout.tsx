import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { Platform } from "react-native";
import * as NavigationBar from 'expo-navigation-bar';

export default function RootLayout() {
  
  useEffect(() => {
    const hideNavigationBar = async () => {
      if (Platform.OS === 'android') {
        try {
          await NavigationBar.setBehaviorAsync('overlay-swipe');
          await NavigationBar.setVisibilityAsync('hidden');
        } catch (error) {
          console.log("Error configurando la barra de navegación:", error);
        }
      }
    };

    hideNavigationBar();
  }, []);

  return (
    <>
      <StatusBar hidden={true} />

      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="registro"
          options={{ title: "Registro de Usuario" }}
        />
        <Stack.Screen
          name="recuperar"
          options={{ title: "Recuperar Contraseña" }}
        />
        <Stack.Screen name="modulos/[id]" options={{ headerShown: true }} />
        <Stack.Screen name="modulos/form" options={{ headerShown: true }} />
        <Stack.Screen name="secciones/form" options={{ headerShown: true }} />
        <Stack.Screen name="secciones/[id]" options={{ headerShown: true }} />
        <Stack.Screen name="items/form" options={{ headerShown: true }} />
      </Stack>
    </>
  );
}