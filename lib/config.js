const fs = require('fs');
const path = require('path');

const PROJECTS_FILE = path.join(__dirname, '..', 'projects.json');

function loadProjects() {
  try {
    if (!fs.existsSync(PROJECTS_FILE)) {
      fs.writeFileSync(PROJECTS_FILE, '[]', 'utf8');
      return [];
    }
    const data = fs.readFileSync(PROJECTS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error loading projects:', err);
    return [];
  }
}

function saveProjects(projects) {
  try {
    fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error saving projects:', err);
    return false;
  }
}

function getProject(id) {
  const projects = loadProjects();
  return projects.find(p => p.id === id);
}

function addProject(project) {
  const projects = loadProjects();
  if (projects.find(p => p.id === project.id)) {
    return { success: false, error: 'Project ID already exists' };
  }
  projects.push(project);
  saveProjects(projects);
  return { success: true };
}

function updateProject(id, updates) {
  const projects = loadProjects();
  const index = projects.findIndex(p => p.id === id);
  if (index === -1) {
    return { success: false, error: 'Project not found' };
  }
  projects[index] = { ...projects[index], ...updates };
  saveProjects(projects);
  return { success: true, project: projects[index] };
}

function deleteProject(id) {
  const projects = loadProjects();
  const index = projects.findIndex(p => p.id === id);
  if (index === -1) {
    return { success: false, error: 'Project not found' };
  }
  projects.splice(index, 1);
  saveProjects(projects);
  return { success: true };
}

module.exports = {
  loadProjects,
  saveProjects,
  getProject,
  addProject,
  updateProject,
  deleteProject
};
