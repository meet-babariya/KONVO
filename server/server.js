const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const { readDb, writeDb } = require('./storage');
const ai = require('./aiService');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({});
      }
    });
  });
}

function sendJson(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

function sendFile(res, filePath) {
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*'
  });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const query = parsedUrl.query;
  const method = req.method;

  try {
    // -------------------------------------------------------------
    // API ROUTES
    // -------------------------------------------------------------

    // 1. GET /api/metrics
    if (method === 'GET' && pathname === '/api/metrics') {
      const db = readDb();
      const ideas = db.ideas || [];
      const projects = db.projects || [];
      const tasks = db.tasks || [];
      const standups = db.standups || [];

      const totalHoursSaved = projects.reduce((acc, p) => acc + (p.meetingsSavedHours || 0), 0);
      const completedTasks = tasks.filter(t => t.status === 'done').length;

      return sendJson(res, {
        totalIdeas: ideas.length,
        pendingIdeas: ideas.filter(i => i.status === 'pending_review').length,
        approvedProjects: projects.length,
        totalHoursSaved,
        completedTasks,
        totalTasks: tasks.length,
        totalStandups: standups.length,
        autonomousVelocityScore: 94
      });
    }

    // 2. GET /api/ideas
    if (method === 'GET' && pathname === '/api/ideas') {
      const db = readDb();
      return sendJson(res, db.ideas || []);
    }

    // 3. POST /api/ideas
    if (method === 'POST' && pathname === '/api/ideas') {
      const body = await parseBody(req);
      const { title, author, role, department, problem, proposedSolution, targetAudience, expectedImpact } = body;

      if (!title || !problem || !proposedSolution) {
        return sendJson(res, { error: 'Title, problem, and proposed solution are required.' }, 400);
      }

      const db = readDb();
      const newIdea = {
        id: 'idea-' + Date.now(),
        title,
        author: author || 'Team Contributor',
        role: role || 'Software Engineer',
        department: department || 'Engineering',
        submittedAt: new Date().toISOString(),
        problem,
        proposedSolution,
        targetAudience: targetAudience || 'Internal Operations',
        expectedImpact: expectedImpact || 'Increased autonomous execution & reduced sync meetings.',
        status: 'pending_review',
        convertedToProjectId: null,
        aiEvaluation: null
      };

      // Autonomously evaluate idea with AI
      newIdea.aiEvaluation = await ai.evaluateIdea(newIdea);

      db.ideas.unshift(newIdea);
      writeDb(db);

      return sendJson(res, newIdea, 201);
    }

    // 4. POST /api/ideas/:id/evaluate
    const evalMatch = pathname.match(/^\/api\/ideas\/([^/]+)\/evaluate$/);
    if (method === 'POST' && evalMatch) {
      const ideaId = evalMatch[1];
      const db = readDb();
      const idea = db.ideas.find(i => i.id === ideaId);
      if (!idea) return sendJson(res, { error: 'Idea not found' }, 404);

      idea.aiEvaluation = await ai.evaluateIdea(idea);
      writeDb(db);
      return sendJson(res, idea);
    }

    // 5. POST /api/ideas/:id/approve
    const approveMatch = pathname.match(/^\/api\/ideas\/([^/]+)\/approve$/);
    if (method === 'POST' && approveMatch) {
      const ideaId = approveMatch[1];
      const body = await parseBody(req);
      const db = readDb();
      const idea = db.ideas.find(i => i.id === ideaId);
      if (!idea) return sendJson(res, { error: 'Idea not found' }, 404);

      if (idea.status === 'approved' && idea.convertedToProjectId) {
        const existingProject = db.projects.find(p => p.id === idea.convertedToProjectId);
        if (existingProject) return sendJson(res, existingProject);
      }

      // Generate PRD, Tech Specs, Roadmap, and Multi-role Task Workstreams
      const artifacts = await ai.generateProjectArtifacts(idea, body);

      const projectId = 'proj-' + Date.now().toString().slice(-4);
      const newProject = {
        id: projectId,
        codeName: artifacts.codeName,
        ideaId: idea.id,
        title: idea.title,
        department: idea.department,
        status: 'active',
        progressPct: 15,
        createdAt: new Date().toISOString(),
        targetCompletionDate: body.targetDate || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
        meetingsSavedHours: 14,
        team: [
          { role: 'Backend Lead', name: idea.author || 'Lead Engineer', tasksCompleted: 0, tasksTotal: 2 },
          { role: 'Frontend Engineer', name: 'UI Specialist', tasksCompleted: 0, tasksTotal: 1 },
          { role: 'DevOps / Cloud', name: 'Platform Engineer', tasksCompleted: 0, tasksTotal: 1 },
          { role: 'QA & Compliance', name: 'QA Specialist', tasksCompleted: 0, tasksTotal: 1 }
        ],
        prdMarkdown: artifacts.prdMarkdown,
        techSpecsMarkdown: artifacts.techSpecsMarkdown,
        roadmap: artifacts.roadmap
      };

      idea.status = 'approved';
      idea.convertedToProjectId = projectId;

      // Create generated tasks
      const createdTasks = (artifacts.tasks || []).map((t, idx) => ({
        id: `task-${Date.now()}-${idx + 1}`,
        projectId: projectId,
        title: t.title,
        role: t.role || 'General',
        assignee: t.role.includes('Backend') ? idea.author : 'Assigned ' + t.role,
        status: idx === 0 ? 'in_progress' : 'todo',
        priority: t.priority || 'medium',
        description: t.description,
        instructions: t.instructions,
        acceptanceCriteria: t.acceptanceCriteria,
        blockers: null,
        aiGuidance: t.aiGuidance
      }));

      db.projects.unshift(newProject);
      db.tasks.push(...createdTasks);
      writeDb(db);

      return sendJson(res, { project: newProject, tasks: createdTasks }, 201);
    }

    // 6. POST /api/ideas/:id/reject
    const rejectMatch = pathname.match(/^\/api\/ideas\/([^/]+)\/reject$/);
    if (method === 'POST' && rejectMatch) {
      const ideaId = rejectMatch[1];
      const body = await parseBody(req);
      const db = readDb();
      const idea = db.ideas.find(i => i.id === ideaId);
      if (!idea) return sendJson(res, { error: 'Idea not found' }, 404);

      idea.status = body.status || 'rejected';
      idea.executiveFeedback = body.feedback || 'De-prioritized for current sprint.';
      writeDb(db);
      return sendJson(res, idea);
    }

    // 7. GET /api/projects
    if (method === 'GET' && pathname === '/api/projects') {
      const db = readDb();
      return sendJson(res, db.projects || []);
    }

    // 8. GET /api/projects/:id/brief
    const briefMatch = pathname.match(/^\/api\/projects\/([^/]+)\/brief$/);
    if (method === 'GET' && briefMatch) {
      const projectId = briefMatch[1];
      const db = readDb();
      const project = db.projects.find(p => p.id === projectId);
      if (!project) return sendJson(res, { error: 'Project not found' }, 404);

      const tasks = db.tasks.filter(t => t.projectId === project.id);
      const standups = db.standups.filter(s => s.projectId === project.id);
      const brief = await ai.generateExecutiveBrief(project, tasks, standups);
      return sendJson(res, { brief });
    }

    // 9. GET /api/projects/:id
    const projectMatch = pathname.match(/^\/api\/projects\/([^/]+)$/);
    if (method === 'GET' && projectMatch) {
      const projectId = projectMatch[1];
      const db = readDb();
      const project = db.projects.find(p => p.id === projectId);
      if (!project) return sendJson(res, { error: 'Project not found' }, 404);

      const tasks = db.tasks.filter(t => t.projectId === project.id);
      const standups = db.standups.filter(s => s.projectId === project.id);
      return sendJson(res, { project, tasks, standups });
    }

    // 10. GET /api/tasks
    if (method === 'GET' && pathname === '/api/tasks') {
      const db = readDb();
      let tasks = db.tasks || [];
      if (query.projectId) {
        tasks = tasks.filter(t => t.projectId === query.projectId);
      }
      if (query.role) {
        tasks = tasks.filter(t => t.role.toLowerCase().includes(query.role.toLowerCase()));
      }
      return sendJson(res, tasks);
    }

    // 11. POST /api/tasks/:id/ask-ai
    const taskAskMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/ask-ai$/);
    if (method === 'POST' && taskAskMatch) {
      const taskId = taskAskMatch[1];
      const body = await parseBody(req);
      const db = readDb();
      const task = db.tasks.find(t => t.id === taskId);
      if (!task) return sendJson(res, { error: 'Task not found' }, 404);

      const project = db.projects.find(p => p.id === task.projectId);
      const question = body.question || 'Explain what I need to do for this task and what the acceptance criteria is.';
      const answer = await ai.answerProjectQuery(project, [task], task.role, question);
      return sendJson(res, { answer });
    }

    // 12. PATCH /api/tasks/:id
    const taskPatchMatch = pathname.match(/^\/api\/tasks\/([^/]+)$/);
    if ((method === 'PATCH' || method === 'POST') && taskPatchMatch) {
      const taskId = taskPatchMatch[1];
      const body = await parseBody(req);
      const db = readDb();
      const task = db.tasks.find(t => t.id === taskId);
      if (!task) return sendJson(res, { error: 'Task not found' }, 404);

      if (body.status) task.status = body.status;
      if (body.assignee) task.assignee = body.assignee;
      if (body.blockers !== undefined) task.blockers = body.blockers;

      // Recalculate project progress
      const project = db.projects.find(p => p.id === task.projectId);
      if (project) {
        const projectTasks = db.tasks.filter(t => t.projectId === project.id);
        const doneCount = projectTasks.filter(t => t.status === 'done').length;
        project.progressPct = Math.round((doneCount / projectTasks.length) * 100);
        if (body.status === 'done') {
          project.meetingsSavedHours = (project.meetingsSavedHours || 0) + 2;
        }
      }

      writeDb(db);
      return sendJson(res, { task, project });
    }

    // 13. GET /api/standups
    if (method === 'GET' && pathname === '/api/standups') {
      const db = readDb();
      let list = db.standups || [];
      if (query.projectId) {
        list = list.filter(s => s.projectId === query.projectId);
      }
      return sendJson(res, list);
    }

    // 14. POST /api/standups
    if (method === 'POST' && pathname === '/api/standups') {
      const body = await parseBody(req);
      const { projectId, employeeName, role, completedWork, currentFocus, blockers } = body;
      const db = readDb();
      const project = db.projects.find(p => p.id === projectId) || db.projects[0];

      const aiSummary = await ai.processStandupCheckin(
        project,
        employeeName || 'Contributor',
        role || 'Engineering',
        completedWork || '',
        currentFocus || '',
        blockers || 'None'
      );

      const newStandup = {
        id: 'std-' + Date.now(),
        projectId: projectId || (project ? project.id : 'proj-01'),
        employeeName: employeeName || 'Team Contributor',
        role: role || 'Engineer',
        timestamp: new Date().toISOString(),
        completedWork,
        currentFocus,
        blockers: blockers || 'None',
        aiStandupSummary: aiSummary
      };

      if (project) {
        project.meetingsSavedHours = (project.meetingsSavedHours || 0) + 1.5;
      }

      db.standups.unshift(newStandup);
      writeDb(db);

      return sendJson(res, newStandup, 201);
    }

    // 15. POST /api/chat
    if (method === 'POST' && pathname === '/api/chat') {
      const body = await parseBody(req);
      const { projectId, role, question, employeeName } = body;
      const db = readDb();
      const project = db.projects.find(p => p.id === projectId) || db.projects[0];
      const tasks = db.tasks.filter(t => t.projectId === project?.id);

      const answer = await ai.answerProjectQuery(project, tasks, role, question);

      const userMsg = {
        id: 'chat-' + Date.now(),
        projectId: project?.id,
        role: role || 'Contributor',
        employeeName: employeeName || 'You',
        sender: 'user',
        text: question,
        timestamp: new Date().toISOString()
      };

      const aiMsg = {
        id: 'chat-' + (Date.now() + 1),
        projectId: project?.id,
        role: role || 'Contributor',
        employeeName: 'Konvo AI',
        sender: 'assistant',
        text: answer,
        timestamp: new Date().toISOString()
      };

      db.chatHistory = db.chatHistory || [];
      db.chatHistory.push(userMsg, aiMsg);
      writeDb(db);

      return sendJson(res, { answer, messages: [userMsg, aiMsg] });
    }

    // 16. GET /api/chat
    if (method === 'GET' && pathname === '/api/chat') {
      const db = readDb();
      let history = db.chatHistory || [];
      if (query.projectId) {
        history = history.filter(c => c.projectId === query.projectId);
      }
      return sendJson(res, history.slice(-40));
    }

    // 17. GET /api/settings & POST /api/settings
    if (method === 'GET' && pathname === '/api/settings') {
      const db = readDb();
      const settings = { ...(db.settings || {}) };
      if (settings.geminiApiKey) {
        settings.hasKey = true;
        settings.maskedKey = settings.geminiApiKey.slice(0, 4) + '...' + settings.geminiApiKey.slice(-4);
        delete settings.geminiApiKey;
      } else {
        settings.hasKey = false;
      }
      return sendJson(res, settings);
    }

    if (method === 'POST' && pathname === '/api/settings') {
      const body = await parseBody(req);
      const db = readDb();
      db.settings = db.settings || {};
      if (body.geminiApiKey !== undefined) {
        db.settings.geminiApiKey = body.geminiApiKey.trim();
      }
      if (body.companyName) {
        db.settings.companyName = body.companyName;
      }
      if (body.model) {
        db.settings.model = body.model;
      }
      writeDb(db);
      return sendJson(res, { success: true, message: 'Settings saved' });
    }

    // -------------------------------------------------------------
    // STATIC FILE SERVING
    // -------------------------------------------------------------
    let targetPath = pathname === '/' ? '/index.html' : pathname;
    let safePath = path.join(PUBLIC_DIR, path.normalize(targetPath).replace(/^(\.\.[/\\])+/, ''));

    if (fs.existsSync(safePath) && fs.statSync(safePath).isFile()) {
      return sendFile(res, safePath);
    }

    // Fallback to index.html for SPA routing
    const indexPath = path.join(PUBLIC_DIR, 'index.html');
    if (fs.existsSync(indexPath)) {
      return sendFile(res, indexPath);
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  } catch (err) {
    console.error('Server error processing request:', err);
    sendJson(res, { error: 'Internal Server Error: ' + err.message }, 500);
  }
});

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 KONVO: Autonomous Enterprise AI Orchestrator running!`);
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`💡 Mode: Intelligent Self-Contained AI + Gemini Integration`);
  console.log(`⚡ Zero external runtime dependencies`);
  console.log(`=======================================================`);
});
