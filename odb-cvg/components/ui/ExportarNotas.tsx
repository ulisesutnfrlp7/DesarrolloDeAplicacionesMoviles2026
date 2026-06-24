// components/ui/ExportarNotas.tsx
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import React, { useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import * as XLSX from "xlsx";
import { formatearValorNota, obtenerNotaNumerica, type ValorNota } from "../../hooks/useNotas";

interface NotaExportable {
  nombre: string;
  nota: ValorNota;
}

interface ExportarNotasProps {
  nombreExamen: string;
  notas: NotaExportable[];
  seccionTitulo?: string;
}

export default function ExportarNotas({
  nombreExamen,
  notas,
  seccionTitulo = "",
}: ExportarNotasProps) {
  const [exportandoPDF, setExportandoPDF] = useState(false);
  const [exportandoXLSX, setExportandoXLSX] = useState(false);

  const fechaActual = new Date().toLocaleDateString("es-AR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const anioLectivo = new Date().getFullYear();

  // Formatear nota: si es entero sin decimales (7, 9, 10) mostrar "7", si tiene decimales (7.5) mostrar "7,5"
  const notasNumericas = notas
    .map((nota) => obtenerNotaNumerica(nota.nota))
    .filter((nota): nota is number => nota !== null);
  const promedio = notasNumericas.length > 0
    ? notasNumericas.reduce((acc, nota) => acc + nota, 0) / notasNumericas.length
    : null;

  // ─── GENERAR HTML PARA PDF ──────────────────────────────────────────────
  const generarHTML = (): string => {
    const filas = notas
      .map(
        (n, i) => `
        <tr>
          <td class="num">${i + 1}</td>
          <td>${n.nombre}</td>
          <td class="nota">${formatearValorNota(n.nota)}</td>
        </tr>`,
      )
      .join("");

    return `
      <html>
      <head>
        <meta charset="utf-8" />
        <style>
          @page { margin: 20mm 15mm; }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: 'Times New Roman', Times, serif;
            font-size: 12pt;
            color: #222;
            padding: 0 10px;
          }
          .header {
            text-align: center;
            margin-bottom: 24px;
            padding-bottom: 16px;
            border-bottom: 2px solid #0F4A32;
          }
          .header h1 {
            font-size: 14pt;
            font-weight: bold;
            color: #0F4A32;
            margin-bottom: 4px;
          }
          .header h2 {
            font-size: 12pt;
            font-weight: normal;
            color: #444;
          }
          .info {
            margin-bottom: 20px;
            line-height: 1.6;
          }
          .info p {
            margin-bottom: 2px;
          }
          .info strong {
            color: #0F4A32;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 12px;
          }
          th {
            background-color: #0F4A32;
            color: #FFFFFF;
            padding: 8px 10px;
            text-align: left;
            font-size: 11pt;
          }
          th.num, th.nota { text-align: center; width: 50px; }
          td {
            padding: 6px 10px;
            border-bottom: 1px solid #DDD;
            font-size: 11pt;
          }
          td.num { text-align: center; color: #666; }
          td.nota {
            text-align: center;
            font-weight: bold;
          }
          tr:nth-child(even) td {
            background-color: #F9FAFB;
          }
          .footer {
            margin-top: 24px;
            padding-top: 12px;
            border-top: 1px solid #CCC;
            font-size: 10pt;
            color: #888;
            text-align: center;
          }
          .promedio {
            margin-top: 16px;
            text-align: right;
            font-size: 12pt;
            font-weight: bold;
            color: #0F4A32;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Universidad Nacional de La Plata - Facultad de Odontología</h1>
          <h2>Cátedra de Operatoria Dental B</h2>
        </div>

        <div class="info">
          <p><strong>Exámen:</strong> ${nombreExamen}</p>
          <p><strong>Año Lectivo:</strong> ${anioLectivo}</p>
        </div>

        <table>
          <thead>
            <tr>
              <th class="num">#</th>
              <th>Alumno</th>
              <th class="nota">Nota</th>
            </tr>
          </thead>
          <tbody>
            ${filas}
          </tbody>
        </table>

        <div class="promedio">
          Promedio de la clase: ${promedio !== null ? promedio.toFixed(1).replace(".", ",") : "-"}
        </div>

        <div class="footer">
          FECHA DE GENERACIÓN: ${fechaActual} - Sistema CVG Operatoria Dental B
        </div>
      </body>
      </html>
    `;
  };

  // ─── GENERAR Y COMPARTIR PDF ────────────────────────────────────────────
  const handleExportarPDF = async () => {
    if (notas.length === 0) return;
    setExportandoPDF(true);
    try {
      const html = generarHTML();
      const { uri } = await Print.printToFileAsync({ html });
      const nombreArchivo = `Notas_${nombreExamen.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
      const uriFinal = `${FileSystem.cacheDirectory}${nombreArchivo}`;
      await FileSystem.moveAsync({ from: uri, to: uriFinal });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uriFinal, {
          mimeType: "application/pdf",
          dialogTitle: `Compartir PDF - ${nombreExamen}`,
          UTI: "com.adobe.pdf",
        });
      }
    } catch (error) {
      console.error("Error exportando PDF:", error);
    } finally {
      setExportandoPDF(false);
    }
  };

  // ─── GENERAR Y COMPARTIR EXCEL ──────────────────────────────────────────
  const handleExportarXLSX = async () => {
    if (notas.length === 0) return;
    setExportandoXLSX(true);
    try {
      // Preparar datos para SheetJS
      const data = notas.map((n, i) => ({
        "#": i + 1,
        Alumno: n.nombre,
        Nota: formatearValorNota(n.nota),
      }));

      const ws = XLSX.utils.json_to_sheet(data);

      // Ajustar ancho de columnas
      ws["!cols"] = [
        { wch: 6 },   // #
        { wch: 40 },  // Alumno
        { wch: 10 },  // Nota
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, nombreExamen.slice(0, 31));

      // Generar archivo como base64
      const wbout = XLSX.write(wb, {
        type: "base64",
        bookType: "xlsx",
      });

      const nombreArchivo = `Notas_${nombreExamen.replace(/[^a-zA-Z0-9]/g, "_")}.xlsx`;
      const uri = `${FileSystem.cacheDirectory}${nombreArchivo}`;

      await FileSystem.writeAsStringAsync(uri, wbout, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          dialogTitle: `Compartir Excel - ${nombreExamen}`,
          UTI: "org.openxmlformats.spreadsheetml.sheet",
        });
      }
    } catch (error) {
      console.error("Error exportando XLSX:", error);
    } finally {
      setExportandoXLSX(false);
    }
  };

  if (notas.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Exportar notas</Text>
      <View style={styles.botonesRow}>
        <TouchableOpacity
          style={[styles.btn, styles.btnPDF]}
          onPress={handleExportarPDF}
          disabled={exportandoPDF || exportandoXLSX}
          activeOpacity={0.8}
        >
          {exportandoPDF ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <>
              <Ionicons name="document-outline" size={18} color="#FFFFFF" />
              <Text style={styles.btnText}>PDF</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, styles.btnXLSX]}
          onPress={handleExportarXLSX}
          disabled={exportandoPDF || exportandoXLSX}
          activeOpacity={0.8}
        >
          {exportandoXLSX ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
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

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    marginTop: 16,
    borderWidth: 10,
    borderColor: "#efefef",
  },
  titulo: {
    fontSize: 12,
    fontWeight: "700",
    color: "#9CA3AF",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  botonesRow: {
    flexDirection: "row",
    gap: 10,
  },
  btn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderRadius: 10,
  },
  btnPDF: {
    backgroundColor: "#DC2626",
  },
  btnXLSX: {
    backgroundColor: "#25B471",
  },
  btnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
});
