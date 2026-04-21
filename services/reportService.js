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
  // 获取所有报告（管理员用）
  getAll: () => {
    return readReports().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  // 获取用户自己的报告
  getByUser: (userId) => {
    return readReports()
      .filter(r => r.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  getById: (id, userId = null, isAdmin = false) => {
    const reports = readReports();
    const report = reports.find(r => r.id === id);
    
    if (!report) return null;
    
    // 检查权限：管理员或报告的所有者
    if (isAdmin || report.userId === userId) {
      return report;
    }
    
    return null;
  },

  create: (data, userId) => {
    const reports = readReports();
    const newReport = {
      id: uuidv4(),
      userId,
      createdAt: new Date().toISOString(),
      ...data
    };
    reports.push(newReport);
    writeReports(reports);
    return newReport;
  },

  delete: (id, userId = null, isAdmin = false) => {
    let reports = readReports();
    const reportIndex = reports.findIndex(r => r.id === id);
    
    if (reportIndex === -1) return false;
    
    const report = reports[reportIndex];
    
    // 检查权限：管理员或报告的所有者
    if (!isAdmin && report.userId !== userId) {
      return false;
    }
    
    const initialLength = reports.length;
    reports = reports.filter(r => r.id !== id);
    if (reports.length !== initialLength) {
      writeReports(reports);
      return true;
    }
    return false;
  }
};
