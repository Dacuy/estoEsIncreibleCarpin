const express = require('express');
const fs = require('fs-extra');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = 3000;

// Directorios
const instancesDir = path.join(__dirname, 'minecraft-instances');
const extractedDir = path.join(__dirname, 'extracted');

// Función para descargar un archivo
async function downloadFile(url, outputPath) {
  const writer = fs.createWriteStream(outputPath);
  
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream',
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

// Función para generar el hash SHA-1 de un archivo
function getFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha1');
    const stream = fs.createReadStream(filePath);
    stream.on('data', data => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

// Función recursiva para obtener todos los archivos dentro de un directorio (incluyendo subcarpetas)
async function getFilesRecursively(dir, instanceName) {
  const filesList = [];
  const files = fs.readdirSync(dir, { withFileTypes: true });

  for (const file of files) {
    const filePath = path.join(dir, file.name);
    
    if (file.isDirectory()) {
      const nestedFiles = await getFilesRecursively(filePath, instanceName);
      filesList.push(...nestedFiles);
    } else {
      const stats = fs.statSync(filePath);
      const fileHash = await getFileHash(filePath);

      const relativePath = path.relative(path.join(extractedDir, instanceName), filePath);
      const url = `https://estoesincreiblecarpin.onrender.com/download/${instanceName}/${relativePath}`;

      filesList.push({
        url: url,
        size: stats.size,
        hash: fileHash,
        path: relativePath
      });
    }
  }

  return filesList;
}

// Función para procesar el ZIP
async function processInstanceZip(zipPath) {
  const zip = new AdmZip(zipPath);
  const instanceName = path.basename(zipPath, '.zip');
  const outputDir = path.join(extractedDir, instanceName);
  zip.extractAllTo(outputDir, true);

  const filesList = await getFilesRecursively(outputDir, instanceName);

  const jsonOutputPath = path.join(extractedDir, `${instanceName}.json`);
  fs.writeJsonSync(jsonOutputPath, filesList, { spaces: 2 });

  console.log(`Instancia ${instanceName} procesada. Lista de archivos disponible en ${jsonOutputPath}`);
  return filesList;
}

// Ruta para descargar los archivos extraídos
app.get('/download/:instanceName/*', (req, res) => {
  const { instanceName } = req.params;
  const filePath = path.join(extractedDir, instanceName, req.params[0]);
  res.download(filePath);
});

// Ruta para obtener el JSON generado
app.get('/instances/:instanceName', (req, res) => {
  const { instanceName } = req.params;
  const jsonFilePath = path.join(extractedDir, `${instanceName}.json`);
  if (fs.existsSync(jsonFilePath)) {
    res.sendFile(jsonFilePath);
  } else {
    res.status(404).json({ error: "Instancia no encontrada" });
  }
});
app.get('/news', (req, res) => {
  const newsPath = path.join(__dirname, 'news.json');
  
  fs.readFile(newsPath, 'utf8', (err, data) => {
      if (err) {
          console.error("Error al leer news.json:", err);
          res.status(500).json({ error: 'Error al obtener las noticias' });
          return;
      }

      try {
          const news = JSON.parse(data);
          res.json(news);
      } catch (parseError) {
          console.error("Error al parsear news.json:", parseError);
          res.status(500).json({ error: 'Error al procesar las noticias' });
      }
  });
});
app.listen(PORT, async () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);

  if (!fs.existsSync(instancesDir)) fs.mkdirSync(instancesDir);
  if (!fs.existsSync(extractedDir)) fs.mkdirSync(extractedDir);

  const zipUrl = 'https://www.dropbox.com/scl/fi/48rdehr94o31hns6523kp/carpinCraftPiola.zip?rlkey=plqx54snrdhzlnfqnef2yyg9x&st=z0vgozc0&dl=1';
  const zipFilePath = path.join(instancesDir, 'carpinCraftPiola.zip');

  try {
    await downloadFile(zipUrl, zipFilePath);
    console.log(`Archivo ZIP descargado en ${zipFilePath}`);
    
    // Procesar el archivo ZIP descargado
    await processInstanceZip(zipFilePath);
  } catch (err) {
    console.error('Error al descargar o procesar el archivo ZIP:', err);
  }
});
