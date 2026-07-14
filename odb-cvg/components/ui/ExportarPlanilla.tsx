//components/ui/ExportarPlanilla.tsx
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import React, { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { ColumnaPlanilla, TipoPlanilla } from "../../hooks/usePlanillas";
import { obtenerLogoBase64 } from "../../utils/logoBase64";
import * as XLSX from "xlsx";

interface ExportarPlanillaProps {
  titulo: string;
  alumno?: string;
  tipo: TipoPlanilla;
  columnas: ColumnaPlanilla[];
  filas: Array<{ id: string; orden: number; celdas: Record<string, any> }>;
}

export default function ExportarPlanilla({
  titulo,
  alumno,
  tipo,
  columnas,
  filas,
}: ExportarPlanillaProps) {
  const [exportandoPDF, setExportandoPDF] = useState(false);
  const [exportandoXLSX, setExportandoXLSX] = useState(false);

  const fechaActual = new Date().toLocaleDateString("es-AR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const columnasOrdenadas = [...columnas].sort((a, b) => a.orden - b.orden);
  const filasOrdenadas = [...filas].sort((a, b) => a.orden - b.orden);

  const generarHTML = async () => {
    const logoDataUri = await obtenerLogoBase64();
    const headers = columnasOrdenadas.map((col) => `<th>${escapeHtml(col.titulo)}</th>`).join("");
    const rows = filasOrdenadas
      .map(
        (fila) => `
          <tr>
            ${columnasOrdenadas.map((col) => `<td>${escapeHtml(formatValue(fila.celdas?.[col.id]))}</td>`).join("")}
          </tr>
        `,
      )
      .join("");

    return `
      <html>
      <head>
        <meta charset="utf-8" />
        <style>
          @page { size: A4 landscape; margin: 12mm; }
          body { font-family: Arial, sans-serif; color: #222; font-size: 10pt; }
          .header {
            display: flex;
            align-items: center;
            gap: 12px;
            border-bottom: 2px solid #0F4A32;
            padding-bottom: 10px;
            margin-bottom: 14px;
          }
          .header img.logo {
            width: 46px;
            height: 46px;
            border-radius: 23px;
            object-fit: cover;
            flex-shrink: 0;
          }
          .header .header-texto h1 { color: #0F4A32; font-size: 16pt; margin: 0 0 6px 0; }
          .header .header-texto p { margin: 2px 0; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th { background: #0F4A32; color: white; padding: 7px; text-align: left; }
          td { border: 1px solid #DDD; padding: 6px; vertical-align: top; }
          tr:nth-child(even) td { background: #F9FAFB; }
          .footer { margin-top: 14px; color: #777; font-size: 9pt; text-align: center; }
        </style>
      </head>
      <body>
        <div class="header">
          <img src="${logoDataUri}" class="logo" />
          <div class="header-texto">
            <h1>${escapeHtml(titulo)}</h1>
            <p><strong>Alumno:</strong> ${escapeHtml(alumno || "-")}</p>
            <p><strong>Tipo:</strong> ${tipo === "diaria" ? "Diaria" : "Final"}</p>
            <p><strong>Fecha de exportación:</strong> ${fechaActual}</p>
          </div>
        </div>
        <table>
          <thead><tr>${headers}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="footer">OpB Virtual - Operatoria Dental B</div>
      </body>
      </html>
    `;
  };

  const exportarPDF = async () => {
    if (columnasOrdenadas.length === 0) return;
    setExportandoPDF(true);
    try {
      const { uri } = await Print.printToFileAsync({ html: await generarHTML() });
      const nombreArchivo = `${safeFileName(titulo)}.pdf`;
      const uriFinal = `${FileSystem.cacheDirectory}${nombreArchivo}`;
      await FileSystem.moveAsync({ from: uri, to: uriFinal });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uriFinal, {
          mimeType: "application/pdf",
          dialogTitle: `Compartir PDF - ${titulo}`,
          UTI: "com.adobe.pdf",
        });
      }
    } finally {
      setExportandoPDF(false);
    }
  };

 const exportarXLSX = async () => {
    if (columnasOrdenadas.length === 0) return;
    setExportandoXLSX(true);
    try {
      const encabezado = [
        ["Facultad de Odontología - UNLP"],
        ["Asignatura Operatoria Dental B"],
        [`${titulo}${alumno ? ` — ${alumno}` : ""}`],
        [`Tipo: ${tipo === "diaria" ? "Diaria" : "Final"} · Exportado: ${fechaActual}`],
        [],
        columnasOrdenadas.map((col) => col.titulo),
      ];

      const filasDatos = filasOrdenadas.map((fila) =>
        columnasOrdenadas.map((col) => formatValue(fila.celdas?.[col.id])),
      );

      const ws = XLSX.utils.aoa_to_sheet([...encabezado, ...filasDatos]);
      ws["!cols"] = columnasOrdenadas.map((col) => ({ wch: col.tipo === "textarea" ? 34 : 18 }));
      const ultimaColumna = columnasOrdenadas.length - 1;
      ws["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: ultimaColumna } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: ultimaColumna } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: ultimaColumna } },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Planilla");
      const wbout = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
      const uri = `${FileSystem.cacheDirectory}${safeFileName(titulo)}.xlsx`;
      await FileSystem.writeAsStringAsync(uri, wbout, { encoding: FileSystem.EncodingType.Base64 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          dialogTitle: `Compartir Excel - ${titulo}`,
          UTI: "org.openxmlformats.spreadsheetml.sheet",
        });
      }
    } finally {
      setExportandoXLSX(false);
    }
  };

  if (columnasOrdenadas.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Exportar planilla</Text>
      <View style={styles.botonesRow}>
        <TouchableOpacity style={[styles.btn, styles.btnPDF]} onPress={exportarPDF} disabled={exportandoPDF || exportandoXLSX}>
          {exportandoPDF ? <ActivityIndicator color="#FFFFFF" size="small" /> : (
            <>
              <Ionicons name="document-outline" size={18} color="#FFFFFF" />
              <Text style={styles.btnText}>PDF</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.btnXLSX]} onPress={exportarXLSX} disabled={exportandoPDF || exportandoXLSX}>
          {exportandoXLSX ? <ActivityIndicator color="#FFFFFF" size="small" /> : (
            <>
              <Ionicons name="grid-outline" size={18} color="#FFFFFF" />
              <Text style={styles.btnText}>Excel</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function formatValue(value: any) {
  if (value === undefined || value === null) return "";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  return String(value);
}

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 80) || "Planilla";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  titulo: {
    fontSize: 12,
    fontWeight: "700",
    color: "#9CA3AF",
    textTransform: "uppercase",
    marginBottom: 10,
  },
  botonesRow: { flexDirection: "row", gap: 10 },
  btn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderRadius: 10,
  },
  btnPDF: { backgroundColor: "#DC2626" },
  btnXLSX: { backgroundColor: "#25B471" },
  btnText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
});
