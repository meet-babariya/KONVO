const { readDb, writeDb } = require('./storage');
const ai = require('./aiService');

function setupRoutes(app) {
  // Aggregate Metrics
  app.get('/api/metrics', (req, res) => {
    const db = readDb();
    const ideas = db.ideas || [];
    const projects = db.projects || [];
    const tasks = db.tasks || [];
    const standups = db.standups || [];

    const totalHoursSaved = projects.reduce((acc, p) => acc + (p.meetingsSavedHours || 0), 0);
    const completedTasks = tasks.filter(t => t.status === 'done').length;

    res.json({
      totalIdeas: ideas.length,
      pendingIdeas: ideas.filter(i => i.status === 'pending_review').length,
      approvedProjects: projects.length,
      totalHoursSaved,
      completedTasks,
      totalTasks: tasks.length,
      totalStandups: standups.length,
      autonomousVelocityScore: 94
    });
  });

  // IDEAS API
  app.get('/api/ideas', (req, res) => {
    const db = readDb();
    res.json(db.ideas || []);
  });

  app.post('/api/ideas', async (req, res) => {
    try {
      const { title, author, role, department, problem, proposedSolution, targetAudience, expectedImpact } = req.body;

      if (!title || !problem || !proposedSolution) {
        return res.status(400).json({ error: 'Title, problem, and proposed solution are required.' });
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

      res.status(201).json(newIdea);
    } catch (err) {
      console.error('Error in POST /api/ideas:', err);
      res.status(500).json({ error: 'Failed to submit idea: ' + err.message });
    }
  });

  app.post('/api/ideas/:id/evaluate', async (req, res) => {
    const db = readDb();
    const idea = db.ideas.find(i => i.id === req.params.id);
    if (!idea) return res.status(404).json({ error: 'Idea not found' });

    idea.aiEvaluation = await ai.evaluateIdea(idea);
    writeDb(db);
    res.json(idea);
  });

  // EXECUTIVE APPROVAL -> AUTONOMOUS PROJECT & DOC GENERATION
  app.post('/api/ideas/:id/approve', async (req, res) => {
    try {
      const db = readDb();
      const idea = db.ideas.find(i => i.id === req.params.id);
      if (!idea) return res.status(404).json({ error: 'Idea not found' });

      if (idea.status === 'approved' && idea.convertedToProjectId) {
        const existingProject = db.projects.find(p => p.id === idea.convertedToProjectId);
        if (existingProject) return res.json(existingProject);
      }

      // Generate PRD, Tech Specs, Roadmap, and Multi-role Task Workstreams
      const artifacts = await ai.generateProjectArtifacts(idea, req.body);

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
        targetCompletionDate: req.body.targetDate || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
        meetingsSavedHours: 12,
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
        assignee: t.role === 'Backend Lead' ? idea.author : 'Assigned ' + t.role,
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

      res.status(201).json({ project: newProject, tasks: createdTasks });
    } catch (err) {
      console.error('Error approving idea:', err);
      res.status(500).json({ error: 'Failed to approve idea and generate project: ' + err.message });
    }
  });

  app.post('/api/ideas/:id/reject', (req, res) => {
    const db = readDb();
    const idea = db.ideas.find(i => i.id === req.params.id);
    if (!idea) return res.status(404).json({ error: 'Idea not found' });

    idea.status = req.body.status || 'rejected';
    idea.executiveFeedback = req.body.feedback || 'De-prioritized for current quarter.';
    writeDb(db);
    res.json(idea);
  });

  // PROJECTS API
  app.get('/api/projects', (req, res) => {
    const db = readDb();
    res.json(db.projects || []);
  });

  app.get('/api/projects/:id', (req, res) => {
    const db = readDb();
    const project = db.projects.find(p => p.id === req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const tasks = db.tasks.filter(t => t.projectId === project.id);
    const standups = db.standups.filter(s => s.projectId === project.id);

    res.json({ project, tasks, standups });
  });

  app.get('/api/projects/:id/brief', async (req, res) => {
    const db = readDb();
    const project = db.projects.find(p => p.id === req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const tasks = db.tasks.filter(t => t.projectId === project.id);
    const standups = db.standups.filter(s => s.projectId === project.id);

    const brief = await ai.generateExecutiveBrief(project, tasks, standups);
    res.json({ brief });
  });

  // TASKS API
  app.get('/api/tasks', (req, res) => {
    const db = readDb();
    let tasks = db.tasks || [];
    if (req.query.projectId) {
      tasks = tasks.filter(t => t.projectId === req.query.projectId);
    }
    if (req.query.role) {
      tasks = tasks.filter(t => t.role.toLowerCase().includes(req.query.role.toLowerCase()));
    }
    res.json(tasks);
  });

  app.patch('/api/tasks/:id', (req, res) => {
    const db = readDb();
    const task = db.tasks.find(t => t.id === req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    if (req.body.status) task.status = req.body.status;
    if (req.body.assignee) task.assignee = req.body.assignee;
    if (req.body.blockers !== undefined) task.blockers = req.body.blockers;

    // Recalculate project progress
    const project = db.projects.find(p => p.id === task.projectId);
    if (project) {
      const projectTasks = db.tasks.filter(t => t.projectId === project.id);
      const doneCount = projectTasks.filter(t => t.status === 'done').length;
      project.progressPct = Math.round((doneCount / projectTasks.length) * 100);
      if (req.body.status === 'done') {
        project.meetingsSavedHours = (project.meetingsSavedHours || 0) + 2;
      }
    }

    writeDb(db);
    res.json({ task, project });
  });

  app.post('/api/tasks/:id/ask-ai', async (req, res) => {
    const db = readDb();
    const task = db.tasks.find(t => t.id === req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const project = db.projects.find(p => p.id === task.projectId);
    const question = req.body.question || 'Explain what I need to do for this task and what the acceptance criteria is.';
    const answer = await ai.answerProjectQuery(project, [task], task.role, question);

    res.json({ answer });
  });

  // ASYNC STANDUP CHECK-INS (REPLACES MEETINGS)
  app.get('/api/standups', (req, res) => {
    const db = readDb();
    let list = db.standups || [];
    if (req.query.projectId) {
      list = list.filter(s => s.projectId === req.query.projectId);
    }
    res.json(list);
  });

  app.post('/api/standups', async (req, res) => {
    try {
      const { projectId, employeeName, role, completedWork, currentFocus, blockers } = req.body;
      const db = readDb();
      const project = db.projects.find(p => p.id === projectId);

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
        project.meetingsSavedHours = (project.meetingsSavedHours || 0) + 1.5; // Each async standup saves 1.5 hours of collective meeting time
      }

      db.standups.unshift(newStandup);
      writeDb(db);

      res.status(201).json(newStandup);
    } catch (err) {
      console.error('Error submitting standup:', err);
      res.status(500).json({ error: 'Failed to record check-in: ' + err.message });
    }
  });

  // KONVO AI COMMUNICATION CHANNEL
  app.post('/api/chat', async (req, res) => {
    try {
      const { projectId, role, question, employeeName } = req.body;
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

      res.json({ answer, messages: [userMsg, aiMsg] });
    } catch (err) {
      console.error('Error in chat:', err);
      res.status(500).json({ error: 'Chat failed: ' + err.message });
    }
  });

  app.get('/api/chat', (req, res) => {
    const db = readDb();
    let history = db.chatHistory || [];
    if (req.query.projectId) {
      history = history.filter(c => c.projectId === req.query.projectId);
    }
    res.json(history.slice(-30));
  });

  // SETTINGS API
  app.get('/api/settings', (req, res) => {
    const db = readDb();
    const settings = { ...(db.settings || {}) };
    if (settings.geminiApiKey) {
      settings.hasKey = true;
      settings.maskedKey = settings.geminiApiKey.slice(0, 4) + '...' + settings.geminiApiKey.slice(-4);
      delete settings.geminiApiKey;
    } else {
      settings.hasKey = false;
    }
    res.json(settings);
  });

  app.post('/api/settings', (req, res) => {
    const db = readDb();
    db.settings = db.settings || {};
    if (req.body.geminiApiKey !== undefined) {
      db.settings.geminiApiKey = req.body.geminiApiKey.trim();
    }
    if (req.body.companyName) {
      db.settings.companyName = req.body.companyName;
    }
    if (req.body.model) {
      db.settings.model = req.body.model;
    }
    writeDb(db);
    res.json({ success: true, message: 'Settings updated successfully' });
  });
}

module.exports = { setupRoutes };
