/**
 * KONVO: Autonomous Enterprise AI Orchestrator
 * Client Application Logic
 */

let state = {
  metrics: {},
  ideas: [],
  projects: [],
  tasks: [],
  standups: [],
  chatHistory: [],
  selectedProjectId: null,
  activeRoleFilter: 'all',
  settings: {}
};

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
  await loadAllData();
  setupEventListeners();
  if (window.lucide) {
    window.lucide.createIcons();
  }
});

async function loadAllData() {
  try {
    const [metrics, ideas, projects, tasks, standups, settings] = await Promise.all([
      fetch('/api/metrics').then(r => r.json()),
      fetch('/api/ideas').then(r => r.json()),
      fetch('/api/projects').then(r => r.json()),
      fetch('/api/tasks').then(r => r.json()),
      fetch('/api/standups').then(r => r.json()),
      fetch('/api/settings').then(r => r.json())
    ]);

    state.metrics = metrics;
    state.ideas = ideas;
    state.projects = projects;
    state.tasks = tasks;
    state.standups = standups;
    state.settings = settings;

    if (projects.length > 0 && !state.selectedProjectId) {
      state.selectedProjectId = projects[0].id;
    }

    renderMetrics();
    renderIdeas();
    renderExecutiveInbox();
    populateProjectSelectors();
    renderSelectedProjectDocs();
    renderWorkstreams();
    renderTracker();
    loadChatMessages();
    renderSettingsValues();

  } catch (err) {
    console.error('Failed to load application data:', err);
    showToast('Failed to connect to Konvo backend: ' + err.message, 'error');
  }
}

// -------------------------------------------------------------
// METRICS RENDERING
// -------------------------------------------------------------
function renderMetrics() {
  const m = state.metrics;
  if (!m) return;

  const totalIdeasEl = document.getElementById('metric-ideas');
  const pendingIdeasEl = document.getElementById('metric-pending-ideas');
  const projectsEl = document.getElementById('metric-projects');
  const hoursSavedEl = document.getElementById('metric-hours-saved');
  const badgeTabIdeas = document.getElementById('badge-tab-ideas');
  const badgeTabPending = document.getElementById('badge-tab-pending');

  if (totalIdeasEl) totalIdeasEl.innerText = m.totalIdeas || 0;
  if (pendingIdeasEl) pendingIdeasEl.innerText = `${m.pendingIdeas || 0} Pending`;
  if (projectsEl) projectsEl.innerText = m.approvedProjects || 0;
  if (hoursSavedEl) hoursSavedEl.innerText = m.totalHoursSaved || 0;
  if (badgeTabIdeas) badgeTabIdeas.innerText = m.totalIdeas || 0;
  if (badgeTabPending) badgeTabPending.innerText = m.pendingIdeas || 0;
}

// -------------------------------------------------------------
// TAB 1: IDEAS RENDERING
// -------------------------------------------------------------
function renderIdeas() {
  const container = document.getElementById('ideas-grid');
  if (!container) return;

  if (state.ideas.length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center py-12 glass-panel p-8">
        <i data-lucide="lightbulb-off" class="w-12 h-12 text-gray-500 mx-auto mb-3"></i>
        <h3 class="text-base font-semibold text-gray-300">No ideas submitted yet</h3>
        <p class="text-xs text-gray-500 mt-1">Be the first to submit a high-impact proposal for autonomous execution.</p>
        <button onclick="openModal('modal-idea-new')" class="mt-4 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-lg">
          Upload First Idea
        </button>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  container.innerHTML = state.ideas.map(idea => {
    const isApproved = idea.status === 'approved';
    const isPending = idea.status === 'pending_review';
    const aiEval = idea.aiEvaluation || {};

    const statusBadge = isApproved
      ? `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center space-x-1">
           <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
           <span>Approved -> Project</span>
         </span>`
      : isPending
      ? `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-950 text-amber-400 border border-amber-800 flex items-center space-x-1">
           <span class="w-1.5 h-1.5 rounded-full bg-amber-400 pulse-dot"></span>
           <span>Pending Executive Review</span>
         </span>`
      : `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-gray-800 text-gray-400">Archived</span>`;

    return `
      <div class="glass-panel glass-card-hover p-5 flex flex-col justify-between border border-gray-800/80 rounded-xl space-y-4">
        <div>
          <!-- Header: Status & Department -->
          <div class="flex items-start justify-between gap-2">
            <span class="text-[11px] font-medium text-cyan-400 bg-cyan-950/60 border border-cyan-900/60 px-2 py-0.5 rounded">
              ${escapeHtml(idea.department || 'Operations')}
            </span>
            ${statusBadge}
          </div>

          <!-- Title -->
          <h3 class="text-sm font-bold text-white mt-3 line-clamp-2">
            ${escapeHtml(idea.title)}
          </h3>

          <!-- Author info -->
          <p class="text-[11px] text-gray-400 mt-1 flex items-center space-x-1">
            <span>By ${escapeHtml(idea.author)}</span>
            <span>•</span>
            <span class="text-gray-500">${escapeHtml(idea.role)}</span>
          </p>

          <!-- Problem & Solution Preview -->
          <div class="mt-3 bg-gray-950/40 p-3 rounded-lg border border-gray-800/80 space-y-2 text-xs">
            <div>
              <span class="text-[10px] font-bold text-red-400 uppercase tracking-wider block">Pain Point / Friction</span>
              <p class="text-gray-300 line-clamp-2 mt-0.5 text-[11px]">${escapeHtml(idea.problem)}</p>
            </div>
            <div>
              <span class="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">Proposed Automation</span>
              <p class="text-gray-300 line-clamp-2 mt-0.5 text-[11px]">${escapeHtml(idea.proposedSolution)}</p>
            </div>
          </div>
        </div>

        <!-- AI Pre-Assessment Summary -->
        <div class="pt-3 border-t border-gray-800/80 space-y-2.5">
          <div class="flex items-center justify-between text-xs">
            <div class="flex items-center space-x-1.5">
              <i data-lucide="sparkles" class="w-3.5 h-3.5 text-cyan-400"></i>
              <span class="text-gray-400 font-medium">AI Feasibility:</span>
              <span class="font-bold text-cyan-400">${aiEval.feasibilityScore || 90}%</span>
            </div>
            <div class="flex items-center space-x-1.5">
              <span class="text-gray-400 font-medium">Business Value:</span>
              <span class="font-bold text-purple-400">${aiEval.businessValueScore || 92}%</span>
            </div>
          </div>

          <div class="flex items-center justify-between text-[11px] text-gray-400 bg-gray-900/60 px-2.5 py-1.5 rounded-lg border border-gray-800">
            <span>Est. Meetings Saved:</span>
            <span class="font-semibold text-emerald-400">${aiEval.estimatedMeetingsSavedQuarterly || 45} hrs/quarter</span>
          </div>

          <!-- Action buttons -->
          <div class="flex items-center space-x-2 pt-1">
            ${
              isPending
                ? `<button onclick="handleApproveIdea('${idea.id}')" class="w-full bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-semibold text-xs py-2 rounded-lg flex items-center justify-center space-x-1.5 shadow transition">
                     <i data-lucide="check-circle" class="w-3.5 h-3.5"></i>
                     <span>Executive Approve & Build</span>
                   </button>`
                : isApproved && idea.convertedToProjectId
                ? `<button onclick="viewProjectDetails('${idea.convertedToProjectId}')" class="w-full bg-gray-800 hover:bg-gray-700 text-cyan-400 font-semibold text-xs py-2 rounded-lg flex items-center justify-center space-x-1.5 transition">
                     <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                     <span>View Active Project & PRD</span>
                   </button>`
                : ''
            }
          </div>
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) window.lucide.createIcons();
}

// -------------------------------------------------------------
// TAB 2: EXECUTIVE INBOX RENDERING
// -------------------------------------------------------------
function renderExecutiveInbox() {
  const container = document.getElementById('executive-inbox');
  if (!container) return;

  const pendingIdeas = state.ideas.filter(i => i.status === 'pending_review');

  if (pendingIdeas.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 glass-panel p-8">
        <i data-lucide="check-circle-2" class="w-12 h-12 text-emerald-400 mx-auto mb-3"></i>
        <h3 class="text-base font-semibold text-gray-200">Executive Inbox is Clear</h3>
        <p class="text-xs text-gray-500 mt-1">All employee proposals have been reviewed and converted to autonomous projects.</p>
        <button onclick="openModal('modal-idea-new')" class="mt-4 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold rounded-lg">
          Upload Another Proposal
        </button>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  container.innerHTML = pendingIdeas.map(idea => {
    const aiEval = idea.aiEvaluation || {};
    const swot = aiEval.swotAnalysis || { strengths: [], weaknesses: [], opportunities: [], threats: [] };

    return `
      <div class="glass-panel p-6 border-l-4 border-l-amber-500 space-y-4">
        
        <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <div class="flex items-center space-x-2">
              <span class="text-xs font-bold px-2.5 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800">
                Awaiting Leadership Approval
              </span>
              <span class="text-xs text-gray-400">• ${escapeHtml(idea.department)}</span>
            </div>
            <h3 class="text-base font-bold text-white mt-1.5">${escapeHtml(idea.title)}</h3>
            <p class="text-xs text-gray-400 mt-0.5">Submitted by <strong>${escapeHtml(idea.author)}</strong> (${escapeHtml(idea.role)})</p>
          </div>

          <!-- AI Score Pill -->
          <div class="flex items-center space-x-3 bg-gray-900/90 border border-gray-800 p-2.5 rounded-xl self-start sm:self-auto">
            <div class="text-center">
              <span class="text-[10px] text-gray-500 block uppercase font-bold">Feasibility</span>
              <span class="text-base font-bold text-cyan-400">${aiEval.feasibilityScore || 92}%</span>
            </div>
            <div class="h-6 w-px bg-gray-800"></div>
            <div class="text-center">
              <span class="text-[10px] text-gray-500 block uppercase font-bold">ROI Value</span>
              <span class="text-base font-bold text-purple-400">${aiEval.businessValueScore || 95}%</span>
            </div>
            <div class="h-6 w-px bg-gray-800"></div>
            <div class="text-center">
              <span class="text-[10px] text-gray-500 block uppercase font-bold">Meetings Saved</span>
              <span class="text-base font-bold text-emerald-400">${aiEval.estimatedMeetingsSavedQuarterly || 50}h</span>
            </div>
          </div>
        </div>

        <!-- Problem & Solution Overview -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div class="bg-gray-950/60 p-3.5 rounded-lg border border-gray-800">
            <span class="font-bold text-red-400 block mb-1 uppercase text-[10px] tracking-wider">Problem Statement & Meeting Overhead:</span>
            <p class="text-gray-300">${escapeHtml(idea.problem)}</p>
          </div>
          <div class="bg-gray-950/60 p-3.5 rounded-lg border border-gray-800">
            <span class="font-bold text-emerald-400 block mb-1 uppercase text-[10px] tracking-wider">Proposed LLM Solution & Deliverable:</span>
            <p class="text-gray-300">${escapeHtml(idea.proposedSolution)}</p>
          </div>
        </div>

        <!-- AI Executive Pitch & SWOT Highlights -->
        <div class="bg-indigo-950/20 border border-indigo-900/40 p-4 rounded-xl space-y-3">
          <div class="flex items-start space-x-2">
            <i data-lucide="bot" class="w-4 h-4 text-indigo-400 mt-0.5 flex-shrink-0"></i>
            <div>
              <span class="text-xs font-bold text-indigo-300">Konvo AI Executive Synthesis:</span>
              <p class="text-xs text-gray-300 mt-0.5 leading-relaxed">${escapeHtml(aiEval.executiveSummary || 'High strategic leverage.')}</p>
            </div>
          </div>

          <!-- SWOT Grid -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] pt-1">
            <div class="bg-gray-900/80 p-2 rounded border border-emerald-900/40">
              <span class="text-emerald-400 font-bold block mb-0.5">Strengths:</span>
              <p class="text-gray-300">${escapeHtml(swot.strengths?.[0] || 'High ROI')}</p>
            </div>
            <div class="bg-gray-900/80 p-2 rounded border border-amber-900/40">
              <span class="text-amber-400 font-bold block mb-0.5">Weaknesses:</span>
              <p class="text-gray-300">${escapeHtml(swot.weaknesses?.[0] || 'API setup required')}</p>
            </div>
            <div class="bg-gray-900/80 p-2 rounded border border-cyan-900/40">
              <span class="text-cyan-400 font-bold block mb-0.5">Opportunities:</span>
              <p class="text-gray-300">${escapeHtml(swot.opportunities?.[0] || 'Cross-dept adoption')}</p>
            </div>
            <div class="bg-gray-900/80 p-2 rounded border border-rose-900/40">
              <span class="text-rose-400 font-bold block mb-0.5">Threats:</span>
              <p class="text-gray-300">${escapeHtml(swot.threats?.[0] || 'Rate limits')}</p>
            </div>
          </div>
        </div>

        <!-- Executive Action Buttons -->
        <div class="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-gray-800">
          <div class="flex items-center space-x-2 text-xs text-gray-400">
            <i data-lucide="info" class="w-4 h-4 text-cyan-400"></i>
            <span>Approving will trigger LLM to autonomously draft the PRD, Architecture Specs, and assign tasks.</span>
          </div>

          <div class="flex items-center space-x-2 w-full sm:w-auto">
            <button onclick="handleRejectIdea('${idea.id}')" class="px-3.5 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-semibold transition">
              Decline / Revise
            </button>
            <button onclick="handleApproveIdea('${idea.id}')" class="flex-1 sm:flex-none px-5 py-2 rounded-lg bg-gradient-to-r from-cyan-600 via-indigo-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 text-white text-xs font-bold shadow-lg shadow-indigo-500/20 flex items-center justify-center space-x-2 transition">
              <i data-lucide="zap" class="w-4 h-4"></i>
              <span>Approve & Generate Autonomous Project</span>
            </button>
          </div>
        </div>

      </div>
    `;
  }).join('');

  if (window.lucide) window.lucide.createIcons();
}

// -------------------------------------------------------------
// TAB 3: PROJECT DOCS & PRDS
// -------------------------------------------------------------
function populateProjectSelectors() {
  const docSelect = document.getElementById('doc-project-select');
  const trackerSelect = document.getElementById('tracker-project-select');
  const chatSelect = document.getElementById('chat-project-select');
  const checkinSelect = document.getElementById('checkin-project-id');

  const optionsHtml = state.projects.map(p => `
    <option value="${p.id}" ${p.id === state.selectedProjectId ? 'selected' : ''}>
      ${p.codeName ? '[' + p.codeName + '] ' : ''}${escapeHtml(p.title)}
    </option>
  `).join('');

  if (docSelect) docSelect.innerHTML = optionsHtml;
  if (trackerSelect) trackerSelect.innerHTML = optionsHtml;
  if (chatSelect) chatSelect.innerHTML = optionsHtml;
  if (checkinSelect) checkinSelect.innerHTML = optionsHtml;
}

function loadProjectDocs(projectId) {
  state.selectedProjectId = projectId;
  renderSelectedProjectDocs();
}

function renderSelectedProjectDocs() {
  const project = state.projects.find(p => p.id === state.selectedProjectId) || state.projects[0];
  if (!project) return;

  const prdContainer = document.getElementById('doc-content-prd');
  const techContainer = document.getElementById('doc-content-tech');
  const roadmapContainer = document.getElementById('doc-roadmap-list');
  const teamContainer = document.getElementById('doc-team-list');

  // Render Markdown
  if (prdContainer && window.marked) {
    prdContainer.innerHTML = window.marked.parse(project.prdMarkdown || 'No PRD generated.');
  }
  if (techContainer && window.marked) {
    techContainer.innerHTML = window.marked.parse(project.techSpecsMarkdown || 'No Technical Specifications generated.');
  }

  // Render Roadmap
  if (roadmapContainer) {
    const roadmap = project.roadmap || [];
    roadmapContainer.innerHTML = roadmap.map(rm => {
      const isDone = rm.status === 'completed';
      const isInProg = rm.status === 'in_progress';
      const badgeClass = isDone ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
        : isInProg ? 'bg-cyan-950 text-cyan-400 border-cyan-800'
        : 'bg-gray-800 text-gray-400 border-gray-700';

      return `
        <div class="bg-gray-950/60 p-3 rounded-lg border border-gray-800 space-y-1">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-white">${escapeHtml(rm.milestone)}</span>
            <span class="text-[10px] px-2 py-0.5 rounded border ${badgeClass} font-semibold uppercase">
              ${escapeHtml(rm.timeline)}
            </span>
          </div>
          <p class="text-[11px] text-gray-400">${escapeHtml(rm.deliverables)}</p>
        </div>
      `;
    }).join('');
  }

  // Render Team Roster
  if (teamContainer) {
    const team = project.team || [];
    teamContainer.innerHTML = team.map(member => `
      <div class="flex items-center justify-between bg-gray-950/50 p-2.5 rounded-lg border border-gray-800">
        <div class="flex items-center space-x-2">
          <div class="w-7 h-7 rounded-full bg-cyan-950 border border-cyan-700 flex items-center justify-center text-cyan-300 text-xs font-bold">
            ${member.name ? member.name.charAt(0) : 'U'}
          </div>
          <div>
            <span class="text-xs font-bold text-gray-200 block">${escapeHtml(member.name || 'Engineer')}</span>
            <span class="text-[10px] text-gray-400">${escapeHtml(member.role)}</span>
          </div>
        </div>
        <span class="text-[10px] bg-gray-800 px-2 py-0.5 rounded text-gray-300 font-medium">
          ${member.tasksCompleted || 0}/${member.tasksTotal || 2} Tasks Done
        </span>
      </div>
    `).join('');
  }

  if (window.lucide) window.lucide.createIcons();
}

function showDocSubTab(type) {
  const prdBtn = document.getElementById('doc-tab-prd-btn');
  const techBtn = document.getElementById('doc-tab-tech-btn');
  const prdContent = document.getElementById('doc-content-prd');
  const techContent = document.getElementById('doc-content-tech');

  if (type === 'prd') {
    prdBtn.className = 'px-3 py-1.5 rounded-md text-xs font-semibold bg-cyan-950 text-cyan-400 border border-cyan-800';
    techBtn.className = 'px-3 py-1.5 rounded-md text-xs font-semibold bg-gray-900 text-gray-400 hover:text-gray-200 border border-gray-800';
    prdContent.classList.remove('hidden');
    techContent.classList.add('hidden');
  } else {
    techBtn.className = 'px-3 py-1.5 rounded-md text-xs font-semibold bg-cyan-950 text-cyan-400 border border-cyan-800';
    prdBtn.className = 'px-3 py-1.5 rounded-md text-xs font-semibold bg-gray-900 text-gray-400 hover:text-gray-200 border border-gray-800';
    techContent.classList.remove('hidden');
    prdContent.classList.add('hidden');
  }
}

function copyProjectDoc(type) {
  const project = state.projects.find(p => p.id === state.selectedProjectId) || state.projects[0];
  if (!project) return;

  const textToCopy = type === 'prd' ? project.prdMarkdown : project.techSpecsMarkdown;
  navigator.clipboard.writeText(textToCopy).then(() => {
    showToast(`Copied ${type.toUpperCase()} Markdown to clipboard!`, 'success');
  });
}

// -------------------------------------------------------------
// TAB 4: ROLE WORKSTREAMS ("Tamare su karvanu che")
// -------------------------------------------------------------
function filterRole(role) {
  state.activeRoleFilter = role;
  document.querySelectorAll('.role-pill').forEach(btn => {
    if (btn.innerText.toLowerCase().includes(role.toLowerCase()) || (role === 'all' && btn.innerText.includes('All'))) {
      btn.className = 'role-pill active px-3 py-1 rounded-lg text-xs font-medium bg-cyan-600 text-white';
    } else {
      btn.className = 'role-pill px-3 py-1 rounded-lg text-xs font-medium bg-gray-800 hover:bg-gray-700 text-gray-300';
    }
  });
  renderWorkstreams();
}

function renderWorkstreams() {
  const container = document.getElementById('workstreams-list');
  if (!container) return;

  let tasks = state.tasks;
  if (state.activeRoleFilter !== 'all') {
    tasks = tasks.filter(t => t.role.toLowerCase().includes(state.activeRoleFilter.toLowerCase()));
  }

  if (tasks.length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center py-12 glass-panel p-8">
        <i data-lucide="check-check" class="w-10 h-10 text-emerald-400 mx-auto mb-2"></i>
        <h4 class="text-sm font-semibold text-gray-300">No pending tasks for this role filter</h4>
        <p class="text-xs text-gray-500 mt-1">Select 'All Roles' or switch projects to view instructions.</p>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  container.innerHTML = tasks.map(task => {
    const isDone = task.status === 'done';
    const isInProgress = task.status === 'in_progress';
    const statusColor = isDone ? 'emerald' : isInProgress ? 'cyan' : 'amber';

    return `
      <div class="glass-panel p-5 border border-gray-800 rounded-xl flex flex-col justify-between space-y-4 ${isDone ? 'opacity-75' : ''}">
        <div>
          <!-- Header: Role & Status -->
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-cyan-400 bg-cyan-950/70 border border-cyan-800 px-2.5 py-0.5 rounded-full">
              ${escapeHtml(task.role)}
            </span>

            <select onchange="updateTaskStatus('${task.id}', this.value)" class="text-xs bg-gray-900 border border-gray-700 text-${statusColor}-400 font-semibold rounded-lg px-2 py-1 focus:outline-none">
              <option value="todo" ${task.status === 'todo' ? 'selected' : ''}>To Do</option>
              <option value="in_progress" ${task.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
              <option value="review" ${task.status === 'review' ? 'selected' : ''}>Code Review / QA</option>
              <option value="done" ${task.status === 'done' ? 'selected' : ''}>Completed</option>
            </select>
          </div>

          <!-- Task Title -->
          <h4 class="text-sm font-bold text-white mt-2.5 ${isDone ? 'line-through text-gray-400' : ''}">
            ${escapeHtml(task.title)}
          </h4>

          <p class="text-xs text-gray-300 mt-1">${escapeHtml(task.description)}</p>

          <!-- Exact Instructions: Tamare su karvanu che -->
          <div class="mt-3 bg-gray-950/70 p-3 rounded-lg border border-gray-800 space-y-1.5">
            <span class="text-[10px] font-bold text-cyan-400 uppercase tracking-wider block">
              🎯 Step-by-Step Instructions ("Tamare Su Karvanu Che")
            </span>
            <div class="text-xs text-gray-300 whitespace-pre-line leading-relaxed font-mono text-[11px]">
              ${escapeHtml(task.instructions || 'Execute in accordance with Technical Specifications.')}
            </div>
          </div>

          <!-- Acceptance Criteria -->
          <div class="mt-2.5 text-xs text-gray-400 flex items-start space-x-1.5">
            <i data-lucide="check-square" class="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0"></i>
            <div>
              <strong class="text-gray-300">Acceptance Criteria:</strong>
              <span class="text-gray-400">${escapeHtml(task.acceptanceCriteria || 'PR review passed with unit tests.')}</span>
            </div>
          </div>
        </div>

        <!-- AI Guidance & Standup Replacement Button -->
        <div class="pt-3 border-t border-gray-800 flex items-center justify-between gap-2">
          <div class="text-[11px] text-gray-400 flex items-center space-x-1">
            <i data-lucide="user" class="w-3 h-3 text-gray-500"></i>
            <span>${escapeHtml(task.assignee || 'Unassigned')}</span>
          </div>

          <button onclick="askAiAboutTask('${task.id}')" class="text-xs bg-indigo-950 hover:bg-indigo-900 border border-indigo-700/80 text-indigo-300 font-semibold px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition">
            <i data-lucide="bot" class="w-3.5 h-3.5"></i>
            <span>Ask Konvo AI for Guidance</span>
          </button>
        </div>

      </div>
    `;
  }).join('');

  if (window.lucide) window.lucide.createIcons();
}

async function updateTaskStatus(taskId, newStatus) {
  try {
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    const data = await res.json();
    showToast(`Task status updated to ${newStatus.toUpperCase()}`, 'success');
    await loadAllData();
  } catch (err) {
    showToast('Failed to update task: ' + err.message, 'error');
  }
}

async function askAiAboutTask(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;

  showToast('Consulting Konvo AI...', 'info');

  try {
    const res = await fetch(`/api/tasks/${taskId}/ask-ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: `Give me concrete code/design steps for task: "${task.title}". What should I code and test?` })
    });
    const data = await res.json();

    // Show answer in brief modal
    const modalContent = document.getElementById('brief-modal-content');
    if (modalContent && window.marked) {
      modalContent.innerHTML = window.marked.parse(data.answer);
      openModal('modal-brief');
    }
  } catch (err) {
    showToast('AI Query failed: ' + err.message, 'error');
  }
}

// -------------------------------------------------------------
// TAB 5: REAL-TIME TRACKER & KANBAN ("Project kya ponchyu")
// -------------------------------------------------------------
function loadTrackerData(projectId) {
  state.selectedProjectId = projectId;
  renderTracker();
}

function renderTracker() {
  const project = state.projects.find(p => p.id === state.selectedProjectId) || state.projects[0];
  if (!project) return;

  const projectTasks = state.tasks.filter(t => t.projectId === project.id);
  const doneTasks = projectTasks.filter(t => t.status === 'done');
  const inProgTasks = projectTasks.filter(t => t.status === 'in_progress');
  const reviewTasks = projectTasks.filter(t => t.status === 'review');
  const backlogTasks = projectTasks.filter(t => t.status === 'todo' || t.status === 'backlog');

  const pct = projectTasks.length > 0 ? Math.round((doneTasks.length / projectTasks.length) * 100) : project.progressPct || 0;

  // Update progress bar
  const titleEl = document.getElementById('tracker-project-title');
  const pctLabel = document.getElementById('tracker-pct-label');
  const progressBar = document.getElementById('tracker-progress-bar');
  const meetingsSavedEl = document.getElementById('tracker-meetings-saved');

  if (titleEl) titleEl.innerText = `${project.codeName || 'PROJECT'}: ${project.title}`;
  if (pctLabel) pctLabel.innerText = `${pct}% Completed (${doneTasks.length}/${projectTasks.length} Deliverables)`;
  if (progressBar) progressBar.style.width = `${pct}%`;
  if (meetingsSavedEl) meetingsSavedEl.innerText = `${project.meetingsSavedHours || 35} Hours`;

  // Kanban Columns
  renderKanbanColumn('kanban-col-backlog', 'kanban-count-backlog', backlogTasks);
  renderKanbanColumn('kanban-col-inprogress', 'kanban-count-inprogress', inProgTasks);
  renderKanbanColumn('kanban-col-review', 'kanban-count-review', reviewTasks);
  renderKanbanColumn('kanban-col-done', 'kanban-count-done', doneTasks);

  // Standup Feed
  renderStandupFeed(project.id);
}

function renderKanbanColumn(containerId, countId, tasks) {
  const container = document.getElementById(containerId);
  const countEl = document.getElementById(countId);
  if (countEl) countEl.innerText = tasks.length;
  if (!container) return;

  if (tasks.length === 0) {
    container.innerHTML = `<div class="text-center py-8 text-gray-500 text-xs">No tasks</div>`;
    return;
  }

  container.innerHTML = tasks.map(task => `
    <div class="glass-panel p-3.5 border border-gray-800 rounded-lg hover:border-gray-700 transition space-y-2">
      <div class="flex items-center justify-between">
        <span class="text-[10px] font-bold text-cyan-400 bg-cyan-950 px-2 py-0.5 rounded">
          ${escapeHtml(task.role)}
        </span>
        <span class="text-[10px] text-gray-400">${escapeHtml(task.assignee || 'Engineer')}</span>
      </div>
      <h5 class="text-xs font-semibold text-gray-200 line-clamp-2">${escapeHtml(task.title)}</h5>
      <div class="flex items-center justify-between pt-1">
        <select onchange="updateTaskStatus('${task.id}', this.value)" class="text-[11px] bg-gray-950 border border-gray-800 rounded px-1.5 py-0.5 text-gray-300">
          <option value="todo" ${task.status === 'todo' ? 'selected' : ''}>To Do</option>
          <option value="in_progress" ${task.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
          <option value="review" ${task.status === 'review' ? 'selected' : ''}>Review</option>
          <option value="done" ${task.status === 'done' ? 'selected' : ''}>Done</option>
        </select>
        <button onclick="askAiAboutTask('${task.id}')" class="text-gray-400 hover:text-cyan-400" title="Ask AI">
          <i data-lucide="bot" class="w-3.5 h-3.5"></i>
        </button>
      </div>
    </div>
  `).join('');

  if (window.lucide) window.lucide.createIcons();
}

function renderStandupFeed(projectId) {
  const container = document.getElementById('tracker-standup-feed');
  if (!container) return;

  const projectStandups = state.standups.filter(s => s.projectId === projectId || !s.projectId);

  if (projectStandups.length === 0) {
    container.innerHTML = `<div class="text-center py-4 text-gray-500 text-xs">No async standup check-ins logged yet.</div>`;
    return;
  }

  container.innerHTML = projectStandups.map(s => `
    <div class="bg-gray-950/60 p-3.5 rounded-lg border border-gray-800 space-y-1.5">
      <div class="flex items-center justify-between">
        <div class="flex items-center space-x-2">
          <span class="text-xs font-bold text-white">${escapeHtml(s.employeeName)}</span>
          <span class="text-[10px] text-gray-400 bg-gray-900 px-2 py-0.5 rounded border border-gray-800">${escapeHtml(s.role)}</span>
        </div>
        <span class="text-[10px] text-gray-500">${new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
        <div>
          <span class="text-[10px] font-bold text-emerald-400 block uppercase">Completed:</span>
          <p class="text-gray-300 text-[11px]">${escapeHtml(s.completedWork)}</p>
        </div>
        <div>
          <span class="text-[10px] font-bold text-cyan-400 block uppercase">Next Focus:</span>
          <p class="text-gray-300 text-[11px]">${escapeHtml(s.currentFocus)}</p>
        </div>
      </div>

      <!-- AI Standup Synthesis (Zero-Meeting Insight) -->
      <div class="bg-indigo-950/30 border border-indigo-900/50 p-2 rounded text-[11px] text-indigo-300 flex items-start space-x-1.5 mt-1">
        <i data-lucide="bot" class="w-3.5 h-3.5 text-indigo-400 mt-0.5 flex-shrink-0"></i>
        <span>${escapeHtml(s.aiStandupSummary || 'On schedule without meeting overhead.')}</span>
      </div>
    </div>
  `).join('');

  if (window.lucide) window.lucide.createIcons();
}

// -------------------------------------------------------------
// TAB 6: KONVO AI LIVE CHAT CHANNEL
// -------------------------------------------------------------
async function loadChatMessages() {
  try {
    const res = await fetch('/api/chat');
    const messages = await res.json();
    state.chatHistory = messages;
    renderChat();
  } catch (err) {
    console.error('Failed to load chat history:', err);
  }
}

function renderChat() {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  if (state.chatHistory.length === 0) {
    container.innerHTML = `
      <div class="text-center py-16 text-gray-500 text-xs">
        <i data-lucide="messages-square" class="w-10 h-10 mx-auto text-gray-600 mb-2"></i>
        <p>No messages yet in this project channel.</p>
        <p class="text-gray-600">Ask Konvo AI anything: technical details, what to work on, or architectural queries!</p>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  container.innerHTML = state.chatHistory.map(msg => {
    const isAi = msg.sender === 'assistant';
    return `
      <div class="flex items-start space-x-3 ${isAi ? '' : 'flex-row-reverse space-x-reverse'}">
        <div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold ${
          isAi ? 'bg-gradient-to-tr from-cyan-600 to-indigo-600 text-white' : 'bg-gray-800 text-gray-300 border border-gray-700'
        }">
          ${isAi ? '<i data-lucide="bot" class="w-4 h-4"></i>' : (msg.employeeName ? msg.employeeName.charAt(0) : 'U')}
        </div>

        <div class="max-w-[85%] rounded-2xl p-4 text-xs leading-relaxed space-y-1 ${
          isAi ? 'bg-gray-900 border border-gray-800 text-gray-200 shadow-md' : 'bg-cyan-600/90 text-white shadow-md'
        }">
          <div class="flex items-center justify-between text-[10px] text-gray-400 mb-1">
            <span class="font-bold ${isAi ? 'text-cyan-400' : 'text-cyan-100'}">${escapeHtml(msg.employeeName || 'You')}</span>
            <span class="text-gray-500">${new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <div class="${isAi ? 'markdown-body text-xs' : ''}">
            ${isAi && window.marked ? window.marked.parse(msg.text) : escapeHtml(msg.text)}
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.scrollTop = container.scrollHeight;
  if (window.lucide) window.lucide.createIcons();
}

async function handleSendChat(e) {
  e.preventDefault();
  const input = document.getElementById('chat-input');
  const projectSelect = document.getElementById('chat-project-select');
  const roleSelect = document.getElementById('chat-role-select');

  const text = input.value.trim();
  if (!text) return;

  const projectId = projectSelect ? projectSelect.value : state.selectedProjectId;
  const role = roleSelect ? roleSelect.value : 'Frontend Engineer';

  input.value = '';

  // Optimistically append user message
  const userMsg = {
    sender: 'user',
    employeeName: 'You',
    role: role,
    text: text,
    timestamp: new Date().toISOString()
  };
  state.chatHistory.push(userMsg);
  renderChat();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        role,
        question: text,
        employeeName: 'Team Contributor'
      })
    });
    const data = await res.json();
    await loadChatMessages();
  } catch (err) {
    showToast('Failed to send chat: ' + err.message, 'error');
  }
}

// -------------------------------------------------------------
// EVENT HANDLERS & MODALS
// -------------------------------------------------------------
function setupEventListeners() {
  // Global modal backdrop close
  window.onclick = function(event) {
    if (event.target.classList.contains('fixed') && event.target.id.startsWith('modal-')) {
      event.target.classList.add('hidden');
    }
  };
}

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
  if (window.lucide) window.lucide.createIcons();
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}

function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active', 'border-cyan-400', 'text-cyan-400');
    btn.classList.add('border-transparent', 'text-gray-400');
  });

  document.querySelectorAll('.tab-content').forEach(section => {
    section.classList.add('hidden');
  });

  const activeBtn = document.getElementById(`tab-btn-${tabName}`);
  const activeSection = document.getElementById(`tab-${tabName}`);

  if (activeBtn) {
    activeBtn.classList.add('active', 'border-cyan-400', 'text-cyan-400');
    activeBtn.classList.remove('border-transparent', 'text-gray-400');
  }
  if (activeSection) {
    activeSection.classList.remove('hidden');
  }

  if (window.lucide) window.lucide.createIcons();
}

function viewProjectDetails(projectId) {
  state.selectedProjectId = projectId;
  populateProjectSelectors();
  renderSelectedProjectDocs();
  renderTracker();
  switchTab('projects');
}

async function handleIdeaSubmit(e) {
  e.preventDefault();
  const submitBtn = document.getElementById('btn-submit-idea');
  submitBtn.disabled = true;
  submitBtn.innerText = 'Analyzing with AI...';

  const payload = {
    author: document.getElementById('idea-author').value,
    role: document.getElementById('idea-role').value,
    department: document.getElementById('idea-role').value.split(',')[1]?.trim() || 'Engineering',
    title: document.getElementById('idea-title').value,
    problem: document.getElementById('idea-problem').value,
    proposedSolution: document.getElementById('idea-solution').value,
    targetAudience: document.getElementById('idea-audience').value,
    expectedImpact: document.getElementById('idea-impact').value
  };

  try {
    const res = await fetch('/api/ideas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error('Failed to submit idea');
    const newIdea = await res.json();

    closeModal('modal-idea-new');
    document.getElementById('form-new-idea').reset();
    showToast('Idea submitted and assessed by Konvo AI!', 'success');
    await loadAllData();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<i data-lucide="sparkles" class="w-4 h-4"></i><span>Submit for AI Assessment</span>`;
    if (window.lucide) window.lucide.createIcons();
  }
}

async function handleApproveIdea(ideaId) {
  showToast('Generating PRD, Technical Specs, and Task Workstreams...', 'info');

  try {
    const res = await fetch(`/api/ideas/${ideaId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    if (!res.ok) throw new Error('Failed to approve idea');
    const data = await res.json();

    showToast('Autonomous Project successfully generated!', 'success');
    await loadAllData();

    if (data.project) {
      viewProjectDetails(data.project.id);
    }
  } catch (err) {
    showToast('Approval failed: ' + err.message, 'error');
  }
}

async function handleRejectIdea(ideaId) {
  try {
    const res = await fetch(`/api/ideas/${ideaId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedback: 'Deferred for future evaluation' })
    });
    showToast('Proposal archived with executive feedback.', 'info');
    await loadAllData();
  } catch (err) {
    showToast('Action failed: ' + err.message, 'error');
  }
}

async function handleCheckinSubmit(e) {
  e.preventDefault();
  const payload = {
    projectId: document.getElementById('checkin-project-id').value,
    employeeName: document.getElementById('checkin-name').value,
    role: document.getElementById('checkin-role').value,
    completedWork: document.getElementById('checkin-completed').value,
    currentFocus: document.getElementById('checkin-focus').value,
    blockers: document.getElementById('checkin-blockers').value
  };

  try {
    const res = await fetch('/api/standups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Check-in failed');

    closeModal('modal-checkin');
    document.getElementById('form-checkin').reset();
    showToast('Check-in logged! AI updated project velocity and saved meeting time.', 'success');
    await loadAllData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function triggerExecutiveBriefModal() {
  const project = state.projects.find(p => p.id === state.selectedProjectId) || state.projects[0];
  if (!project) return;

  const modalContent = document.getElementById('brief-modal-content');
  if (modalContent) modalContent.innerHTML = 'Synthesizing up-to-the-minute project status...';
  openModal('modal-brief');

  try {
    const res = await fetch(`/api/projects/${project.id}/brief`);
    const data = await res.json();
    if (modalContent && window.marked) {
      modalContent.innerHTML = window.marked.parse(data.brief);
    }
  } catch (err) {
    if (modalContent) modalContent.innerHTML = 'Failed to generate brief: ' + err.message;
  }
}

function renderSettingsValues() {
  const companyEl = document.getElementById('setting-company');
  const modelEl = document.getElementById('setting-model');
  const engineStatusEl = document.getElementById('ai-engine-status');

  if (companyEl && state.settings.companyName) {
    companyEl.value = state.settings.companyName;
  }
  if (modelEl && state.settings.model) {
    modelEl.value = state.settings.model;
  }
  if (engineStatusEl) {
    engineStatusEl.innerText = state.settings.hasKey ? 'Active (Live Gemini API)' : 'Active (Built-in Heuristic Engine)';
  }
}

async function handleSettingsSave(e) {
  e.preventDefault();
  const apiKey = document.getElementById('setting-apikey').value;
  const companyName = document.getElementById('setting-company').value;
  const model = document.getElementById('setting-model').value;

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ geminiApiKey: apiKey, companyName, model })
    });
    const data = await res.json();
    closeModal('modal-settings');
    showToast('Settings saved successfully!', 'success');
    await loadAllData();
  } catch (err) {
    showToast('Failed to save settings: ' + err.message, 'error');
  }
}

// -------------------------------------------------------------
// UTILITIES
// -------------------------------------------------------------
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  const msgEl = document.getElementById('toast-message');
  const iconEl = document.getElementById('toast-icon');

  if (!toast || !msgEl) return;

  msgEl.innerText = message;
  toast.classList.remove('translate-y-24', 'opacity-0');

  setTimeout(() => {
    toast.classList.add('translate-y-24', 'opacity-0');
  }, 4000);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
