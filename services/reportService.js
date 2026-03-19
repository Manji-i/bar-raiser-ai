import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../data');
const REPORTS_FILE = path.join(DATA_DIR, 'reports.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}

// Ensure reports file exists
if (!fs.existsSync(REPORTS_FILE)) {
  fs.writeFileSync(REPORTS_FILE, JSON.stringify([]));
}

const readReports = () => {
  try {
    const data = fs.readFileSync(REPORTS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error("Error reading reports:", error);
    return [];
  }
};

const writeReports = (reports) => {
  try {
    fs.writeFileSync(REPORTS_FILE, JSON.stringify(reports, null, 2));
  } catch (error) {
    console.error("Error writing reports:", error);
  }
};

export const reportService = {
  getAll: () => {
    return readReports().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  getById: (id) => {
    const reports = readReports();
    return reports.find(r => r.id === id);
  },

  create: (data) => {
    const reports = readReports();
    const newReport = {
      id: uuidv4(),
      createdAt: new Date().toISOString(),
      ...data
    };
    reports.push(newReport);
    writeReports(reports);
    return newReport;
  },

  delete: (id) => {
    let reports = readReports();
    const initialLength = reports.length;
    reports = reports.filter(r => r.id !== id);
    if (reports.length !== initialLength) {
      writeReports(reports);
      return true;
    }
    return false;
  }
};
