const {useState, useMemo, useEffect} = React;

/* =========================================================================
   MODELO DE DADOS (mock em memória, respeitando o desenho relacional)
   ========================================================================= */

const WORKSPACES = [
  {id:"ws_atlas", name:"Atlas Distribuidora"},
  {id:"ws_nortex", name:"Nortex Engenharia"},
];

// módulos contratados por workspace — controla quais abas aparecem no header
// (estado inicial; pode ser alterado pelo Owner/Admin na tela de Configurações)
const INITIAL_WORKSPACE_MODULES = {
  ws_atlas:  ["crm", "bot", "landing"],
  ws_nortex: ["crm"],
};

const MODULE_DEFS = [
  {id:"crm",     icon:"📊", label:"CRM"},
  {id:"bot",     icon:"🤖", label:"Bot de IA"},
  {id:"landing", icon:"🌐", label:"Landing Page"},
];

const WORKSPACE_LANDING_URL = {
  ws_atlas: "https://example.com",
};

const USERS = [
  {id:"u_master", name:"Admin Master", initials:"AM"},
  {id:"u_ana",   name:"Ana Ferraz",    initials:"AF"},
  {id:"u_caio",  name:"Caio Bittencourt", initials:"CB"},
  {id:"u_lia",   name:"Lia Prado",     initials:"LP"},
  {id:"u_theo",  name:"Theo Nunes",    initials:"TN"},
];

// workspace_members: define o papel de cada usuário em cada workspace
const MEMBERS = [
  {workspace_id:"ws_atlas",  user_id:"u_ana",  role:"owner"},
  {workspace_id:"ws_atlas",  user_id:"u_caio", role:"manager"},
  {workspace_id:"ws_atlas",  user_id:"u_lia",  role:"sales_rep"},
  {workspace_id:"ws_atlas",  user_id:"u_theo", role:"sales_rep"},
  {workspace_id:"ws_nortex", user_id:"u_ana",  role:"viewer"},
  {workspace_id:"ws_nortex", user_id:"u_caio", role:"owner"},
];

/* =========================================================================
   AUTENTICAÇÃO (mock em memória)
   - cada empresa (workspace) tem sua própria "porta de entrada": o usuário
     escolhe a empresa e entra com credenciais válidas só para aquela empresa.
   - o Admin Master é o único login que não pertence a uma empresa específica:
     ele enxerga todas as empresas e é o único que pode ligar/desligar os
     módulos (CRM / Bot de IA / Landing Page) de cada uma.
   ========================================================================= */
const LOGIN_ACCOUNTS = [
  // login do dono do produto — acesso a todas as empresas + gestão de módulos
  {email:"master@nexo.com", password:"master123", user_id:"u_master", workspace_id:null, is_master:true},

  // logins normais — presos à empresa (workspace) em que o usuário é membro
  {email:"ana@atlasdist.com",   password:"atlas123",  user_id:"u_ana",  workspace_id:"ws_atlas"},
  {email:"caio@atlasdist.com",  password:"atlas123",  user_id:"u_caio", workspace_id:"ws_atlas"},
  {email:"lia@atlasdist.com",   password:"atlas123",  user_id:"u_lia",  workspace_id:"ws_atlas"},
  {email:"theo@atlasdist.com",  password:"atlas123",  user_id:"u_theo", workspace_id:"ws_atlas"},
  {email:"ana@nortex.com",      password:"nortex123", user_id:"u_ana",  workspace_id:"ws_nortex"},
  {email:"caio@nortex.com",     password:"nortex123", user_id:"u_caio", workspace_id:"ws_nortex"},
];

const COMPANIES = [
  {id:"c1", workspace_id:"ws_atlas", name:"Grão Norte Alimentos", segment:"Food & Bev", size:"51-200", owner_id:"u_lia", cnpj:"12.345.678/0001-90", phone:"(11) 3322-1100", email:"contato@graonorte.com"},
  {id:"c2", workspace_id:"ws_atlas", name:"Ferrovia Sul Log.",    segment:"Logística",  size:"200+",   owner_id:"u_theo", cnpj:"23.456.789/0001-11", phone:"(51) 3344-5566", email:"comercial@ferroviasul.com"},
  {id:"c3", workspace_id:"ws_atlas", name:"Bravo Química",        segment:"Indústria",  size:"11-50",  owner_id:"u_lia", cnpj:"34.567.890/0001-22", phone:"(19) 3255-8899", email:"contato@bravoquimica.com"},
  {id:"c4", workspace_id:"ws_atlas", name:"Praiana Cosméticos",   segment:"Beleza",     size:"11-50",  owner_id:"u_caio", cnpj:"45.678.901/0001-33", phone:"(85) 3211-7788", email:"contato@praiana.com"},
  {id:"c5", workspace_id:"ws_nortex", name:"Estrutura Aço Nortex", segment:"Construção", size:"200+",  owner_id:"u_caio", cnpj:"56.789.012/0001-44", phone:"(41) 3299-0011", email:"contato@nortex.com"},
  {id:"c6", workspace_id:"ws_nortex", name:"Vetor Elétrica",       segment:"Energia",    size:"51-200", owner_id:"u_caio", cnpj:"67.890.123/0001-55", phone:"(41) 3288-2233", email:"contato@vetorenergia.com"},
];

const INITIAL_CONTACTS = [
  {id:"p1", workspace_id:"ws_atlas", company_id:"c1", name:"Marina Souza", email:"marina@graonorte.com", phone:"(11) 98221-3344", cpf:"123.456.789-00", role_title:"Compras", owner_id:"u_lia"},
  {id:"p2", workspace_id:"ws_atlas", company_id:"c1", name:"Diego Alves",  email:"diego@graonorte.com",  phone:"(11) 97711-2200", cpf:"234.567.890-11", role_title:"Financeiro", owner_id:"u_lia"},
  {id:"p3", workspace_id:"ws_atlas", company_id:"c2", name:"Renata Costa", email:"renata@ferroviasul.com", phone:"(51) 99123-4455", cpf:"345.678.901-22", role_title:"Operações", owner_id:"u_theo"},
  {id:"p4", workspace_id:"ws_atlas", company_id:"c3", name:"João Prado",   email:"joao@bravoquimica.com", phone:"(19) 98877-6655", cpf:"456.789.012-33", role_title:"CEO", owner_id:"u_lia"},
  {id:"p5", workspace_id:"ws_atlas", company_id:"c4", name:"Bia Nogueira", email:"bia@praiana.com", phone:"(85) 99988-1122", cpf:"567.890.123-44", role_title:"Marketing", owner_id:"u_caio"},
  {id:"p6", workspace_id:"ws_nortex", company_id:"c5", name:"Otávio Reis", email:"otavio@nortex.com", phone:"(41) 99654-7788", cpf:"678.901.234-55", role_title:"Engenharia", owner_id:"u_caio"},
  {id:"p7", workspace_id:"ws_nortex", company_id:"c6", name:"Carla Dias",  email:"carla@vetorenergia.com", phone:"(41) 98123-9900", cpf:"789.012.345-66", role_title:"Suprimentos", owner_id:"u_caio"},
];

const PIPELINES = [
  {id:"pl1", workspace_id:"ws_atlas", name:"Vendas Novas"},
  {id:"pl2", workspace_id:"ws_nortex", name:"Vendas Novas"},
];

const STAGES = [
  {id:"s1", pipeline_id:"pl1", name:"Novo contato",  order:1, probability:10},
  {id:"s2", pipeline_id:"pl1", name:"Conversando",   order:2, probability:30},
  {id:"s3", pipeline_id:"pl1", name:"Enviei proposta", order:3, probability:55},
  {id:"s4", pipeline_id:"pl1", name:"Negociando",    order:4, probability:75},
  {id:"s5", pipeline_id:"pl1", name:"Vendido",       order:5, probability:100, is_won:true},
  {id:"s6", pipeline_id:"pl1", name:"Não fechou",    order:6, probability:0, is_lost:true},
  {id:"s7", pipeline_id:"pl2", name:"Novo contato",  order:1, probability:10},
  {id:"s8", pipeline_id:"pl2", name:"Enviei proposta", order:2, probability:50},
  {id:"s9", pipeline_id:"pl2", name:"Negociando",    order:3, probability:80},
  {id:"s10", pipeline_id:"pl2", name:"Vendido",      order:4, probability:100, is_won:true},
];

const INITIAL_OPPS = [
  {id:"o1", workspace_id:"ws_atlas", company_id:"c1", contact_id:"p1", pipeline_id:"pl1", stage_id:"s2", owner_id:"u_lia", title:"Fornecimento anual grãos", value:186000, status:"open", priority:"high", next_action:"Ligar hoje", last_contact_days:0, created_at:"2026-07-20", closed_at:null},
  {id:"o2", workspace_id:"ws_atlas", company_id:"c1", contact_id:"p2", pipeline_id:"pl1", stage_id:"s3", owner_id:"u_lia", title:"Expansão linha 2", value:74000, status:"open", priority:"medium", next_action:"Enviar e-mail", last_contact_days:2, created_at:"2026-07-28", closed_at:null},
  {id:"o3", workspace_id:"ws_atlas", company_id:"c2", contact_id:"p3", pipeline_id:"pl1", stage_id:"s1", owner_id:"u_theo", title:"Rota logística SP-RS", value:212000, status:"open", priority:"high", next_action:"Ligar hoje", last_contact_days:5, created_at:"2026-08-01", closed_at:null},
  {id:"o4", workspace_id:"ws_atlas", company_id:"c3", contact_id:"p4", pipeline_id:"pl1", stage_id:"s4", owner_id:"u_lia", title:"Insumos químicos Q3", value:98000, status:"open", priority:"medium", next_action:"Enviar contrato", last_contact_days:1, created_at:"2026-07-15", closed_at:null},
  {id:"o5", workspace_id:"ws_atlas", company_id:"c4", contact_id:"p5", pipeline_id:"pl1", stage_id:"s5", owner_id:"u_caio", title:"Embalagens sustentáveis", value:45000, status:"won", priority:"low", next_action:null, last_contact_days:0, created_at:"2026-06-10", closed_at:"2026-07-05"},
  {id:"o6", workspace_id:"ws_atlas", company_id:"c2", contact_id:"p3", pipeline_id:"pl1", stage_id:"s6", owner_id:"u_theo", title:"Frota dedicada", value:150000, status:"lost", priority:"low", next_action:null, last_contact_days:0, created_at:"2026-06-01", closed_at:"2026-06-25"},
  {id:"o7", workspace_id:"ws_nortex", company_id:"c5", contact_id:"p6", pipeline_id:"pl2", stage_id:"s8", owner_id:"u_caio", title:"Estrutura galpão B", value:340000, status:"open", priority:"high", next_action:"Ligar hoje", last_contact_days:3, created_at:"2026-07-22", closed_at:null},
  {id:"o8", workspace_id:"ws_nortex", company_id:"c6", contact_id:"p7", pipeline_id:"pl2", stage_id:"s7", owner_id:"u_caio", title:"Quadros elétricos planta 2", value:88000, status:"open", priority:"medium", next_action:"Enviar proposta", last_contact_days:6, created_at:"2026-08-05", closed_at:null},
  {id:"o9", workspace_id:"ws_atlas", company_id:"c3", contact_id:"p4", pipeline_id:"pl1", stage_id:"s5", owner_id:"u_lia", title:"Reposição trimestral", value:62000, status:"won", priority:"low", next_action:null, last_contact_days:0, created_at:"2026-07-01", closed_at:"2026-08-02"},
  {id:"o10", workspace_id:"ws_atlas", company_id:"c4", contact_id:"p5", pipeline_id:"pl1", stage_id:"s6", owner_id:"u_caio", title:"Kit lançamento verão", value:31000, status:"lost", priority:"low", next_action:null, last_contact_days:0, created_at:"2026-07-10", closed_at:"2026-08-04"},
];

const INITIAL_TASKS = [
  {id:"t1", workspace_id:"ws_atlas", related_to_type:"opportunity", related_to_id:"o1", assignee_id:"u_lia", title:"Enviar proposta revisada", due_date:"2026-08-13", status:"pending", priority:"high"},
  {id:"t2", workspace_id:"ws_atlas", related_to_type:"company", related_to_id:"c2", assignee_id:"u_theo", title:"Ligar para alinhar rota", due_date:"2026-08-12", status:"pending", priority:"medium"},
  {id:"t3", workspace_id:"ws_atlas", related_to_type:"opportunity", related_to_id:"o4", assignee_id:"u_lia", title:"Follow-up contrato assinado", due_date:"2026-08-09", status:"pending", priority:"high"},
  {id:"t4", workspace_id:"ws_atlas", related_to_type:"contact", related_to_id:"p5", assignee_id:"u_caio", title:"Enviar amostras", due_date:"2026-08-20", status:"done", priority:"low"},
  {id:"t5", workspace_id:"ws_nortex", related_to_type:"opportunity", related_to_id:"o7", assignee_id:"u_caio", title:"Visita técnica ao galpão", due_date:"2026-08-15", status:"pending", priority:"medium"},
];

const INITIAL_ACTIVITIES = [
  {id:"a1", workspace_id:"ws_atlas", related_to_type:"opportunity", related_to_id:"o1", author_id:"u_lia", type:"note", content:"Cliente pediu revisão de prazos de entrega.", created_at:"2026-08-08T14:20:00"},
  {id:"a2", workspace_id:"ws_atlas", related_to_type:"opportunity", related_to_id:"o1", author_id:"u_lia", type:"call", content:"Ligação de alinhamento com Marina — 22min.", created_at:"2026-08-06T10:05:00"},
  {id:"a3", workspace_id:"ws_atlas", related_to_type:"company", related_to_id:"c1", author_id:"u_lia", type:"email", content:"Envio de catálogo atualizado.", created_at:"2026-08-01T09:00:00"},
  {id:"a4", workspace_id:"ws_nortex", related_to_type:"opportunity", related_to_id:"o7", author_id:"u_caio", type:"meeting", content:"Reunião técnica com engenharia Nortex.", created_at:"2026-08-07T16:00:00"},
];

const ROLE_LABEL = {owner:"Owner", admin:"Admin", manager:"Manager", sales_rep:"Sales Rep", viewer:"Viewer"};
const PRIORITY_COLOR = {high:"var(--red)", medium:"var(--amber)", low:"var(--muted)"};

function fmtBRL(v){
  return v.toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0});
}
function fmtDate(d){
  const dt = new Date(d);
  return dt.toLocaleDateString('pt-BR',{day:'2-digit',month:'short'});
}
function initialsOf(name){
  return name.split(' ').map(p=>p[0]).slice(0,2).join('').toUpperCase();
}
function userById(id){ return USERS.find(u=>u.id===id); }
function companyById(id){ return COMPANIES.find(c=>c.id===id); }
function contactById(id, contactsList){ return (contactsList||INITIAL_CONTACTS).find(c=>c.id===id); }
function newId(prefix){ return prefix + Math.random().toString(36).slice(2,9); }

/* =========================================================================
   REGRAS DE PERMISSÃO
   ========================================================================= */
// Retorna true se `role` pode ver TODOS os registros do workspace,
// ou apenas os que possuem owner_id === userId (sales_rep).
function canSeeAll(role){
  return role === 'owner' || role === 'admin' || role === 'manager' || role === 'viewer';
}
function canEdit(role){
  return role !== 'viewer';
}
function canManageWorkspace(role){
  return role === 'owner' || role === 'admin';
}

function scopeByOwnership(list, role, userId){
  if (canSeeAll(role)) return list;
  return list.filter(item => item.owner_id === userId);
}

/* =========================================================================
   APP (área logada — uma sessão sempre pertence a UMA empresa por vez;
   só o Admin Master pode trocar de empresa dentro da própria sessão)
   ========================================================================= */
function Workspace({auth, onLogout}){
  const isMaster = !!auth.is_master;
  const [workspaceId, setWorkspaceId] = useState(auth.workspace_id || "ws_atlas");
  const userId = auth.user_id;
  const [page, setPage] = useState("pipeline");
  const [activeModule, setActiveModule] = useState("crm");
  const [workspaceModules, setWorkspaceModules] = useState(INITIAL_WORKSPACE_MODULES);
  const [opps, setOpps] = useState(INITIAL_OPPS);
  const [tasks, setTasks] = useState(INITIAL_TASKS);
  const [activities, setActivities] = useState(INITIAL_ACTIVITIES);
  const [contacts, setContacts] = useState(INITIAL_CONTACTS);
  const [drawer, setDrawer] = useState(null); // {type:'opportunity'|'company', id}
  const [contactModal, setContactModal] = useState(null); // {mode:'view'|'edit'|'new', id}
  const [companyModal, setCompanyModal] = useState(null); // {mode:'new'|'edit', id}
  const [taskModal, setTaskModal] = useState(null); // true when open
  const [opportunityModal, setOpportunityModal] = useState(null); // true when open
  const [inviteModal, setInviteModal] = useState(null); // true when open
  const [members, setMembers] = useState(MEMBERS);
  const [companiesVersion, setCompaniesVersion] = useState(0);
  const [search, setSearch] = useState("");

  // membership do usuário atual no workspace atual.
  // o Admin Master enxerga qualquer empresa com papel equivalente a "owner",
  // mesmo sem estar cadastrado como membro dela.
  const membership = members.find(m=>m.workspace_id===workspaceId && m.user_id===userId);
  const role = isMaster ? 'owner' : (membership ? membership.role : null);

  // usuários disponíveis nesta empresa (para exibição, não para troca de login)
  const workspaceUserIds = members.filter(m=>m.workspace_id===workspaceId).map(m=>m.user_id);

  useEffect(()=>{
    // garante que a aba ativa é um módulo contratado neste workspace
    const contracted = workspaceModules[workspaceId] || ["crm"];
    if(!contracted.includes(activeModule)){
      setActiveModule(contracted[0]);
    }
  },[workspaceId]);

  // -------- Escopo dos dados por workspace_id (isolamento multi-tenant) --------
  const wsCompanies = COMPANIES.filter(c=>c.workspace_id===workspaceId); // eslint-disable-line
  void companiesVersion; // força recalcular quando uma empresa é criada/editada
  const wsContacts  = contacts.filter(c=>c.workspace_id===workspaceId);
  const wsOpps      = opps.filter(o=>o.workspace_id===workspaceId);
  const wsTasks     = tasks.filter(t=>t.workspace_id===workspaceId);
  const wsActivities= activities.filter(a=>a.workspace_id===workspaceId);
  const wsPipelines = PIPELINES.filter(p=>p.workspace_id===workspaceId);
  const pipeline = wsPipelines[0];
  const stages = STAGES.filter(s=>s.pipeline_id===pipeline?.id).sort((a,b)=>a.order-b.order);

  // -------- Escopo por papel (visibilidade de propriedade) --------
  const visibleCompanies = scopeByOwnership(wsCompanies, role, userId);
  const visibleOpps = scopeByOwnership(wsOpps, role, userId);
  const visibleTasks = wsTasks.filter(t=> canSeeAll(role) || t.assignee_id===userId);

  function moveOpportunity(oppId, newStageId){
    if(!canEdit(role)) return;
    setOpps(prev => prev.map(o=>{
      if(o.id!==oppId) return o;
      const stage = STAGES.find(s=>s.id===newStageId);
      const status = stage?.is_won ? 'won' : stage?.is_lost ? 'lost' : 'open';
      // log automático de atividade ao mudar stage (regra de negócio)
      logActivity(o.id, 'opportunity', `Movida para "${stage.name}".`, 'stage_change');
      return {...o, stage_id:newStageId, status};
    }));
  }

  function logActivity(relatedId, relatedType, content, type){
    setActivities(prev=>[{
      id:'a'+Math.random().toString(36).slice(2,8),
      workspace_id:workspaceId, related_to_type:relatedType, related_to_id:relatedId,
      author_id:userId, type, content, created_at:new Date().toISOString()
    }, ...prev]);
  }

  function toggleModule(moduleId){
    // apenas o Admin Master liga/desliga módulos (CRM/Bot/Landing) de uma empresa
    if(!isMaster) return;
    setWorkspaceModules(prev=>{
      const current = prev[workspaceId] || ["crm"];
      const has = current.includes(moduleId);
      // o módulo CRM nunca pode ser removido — é o núcleo do produto
      if(moduleId==='crm') return prev;
      const next = has ? current.filter(m=>m!==moduleId) : [...current, moduleId];
      return {...prev, [workspaceId]: next};
    });
  }

  function saveContact(data){
    if(!canEdit(role)) return;
    if(data.id){
      setContacts(prev=>prev.map(c=> c.id===data.id ? {...c, ...data} : c));
      logActivity(data.id, 'contact', 'Dados do contato atualizados.', 'note');
    } else {
      const id = newId('p');
      setContacts(prev=>[...prev, {...data, id, workspace_id:workspaceId, owner_id:userId}]);
      logActivity(id, 'contact', 'Contato criado.', 'note');
    }
  }

  function saveCompany(data){
    if(!canEdit(role)) return;
    if(data.id){
      const idx = COMPANIES.findIndex(c=>c.id===data.id);
      if(idx>-1) COMPANIES[idx] = {...COMPANIES[idx], ...data};
      logActivity(data.id, 'company', 'Dados da empresa atualizados.', 'note');
    } else {
      const id = newId('c');
      COMPANIES.push({...data, id, workspace_id:workspaceId, owner_id:userId});
      logActivity(id, 'company', 'Empresa criada.', 'note');
    }
    setCompaniesVersion(v=>v+1);
  }

  function saveTask(data){
    if(!canEdit(role)) return;
    setTasks(prev=>[...prev, {
      id:newId('t'), workspace_id:workspaceId, related_to_type:data.related_to_type,
      related_to_id:data.related_to_id, assignee_id:data.assignee_id, title:data.title,
      due_date:data.due_date, status:'pending', priority:data.priority
    }]);
  }

  function saveOpportunity(data){
    if(!canEdit(role)) return;
    const id = newId('o');
    const stage = STAGES.find(s=>s.id===data.stage_id);
    setOpps(prev=>[...prev, {
      id, workspace_id:workspaceId, company_id:data.company_id, contact_id:data.contact_id||null,
      pipeline_id:pipeline?.id, stage_id:data.stage_id, owner_id:data.owner_id, title:data.title,
      value:Number(data.value)||0, status: stage?.is_won?'won':stage?.is_lost?'lost':'open',
      priority:data.priority, next_action:data.next_action||null, last_contact_days:0,
      created_at: new Date().toISOString().slice(0,10), closed_at: stage?.is_won||stage?.is_lost ? new Date().toISOString().slice(0,10) : null
    }]);
    logActivity(id, 'opportunity', 'Negócio criado.', 'note');
  }

  function inviteMember(email, invitedRole){
    if(!canManageWorkspace(role)) return;
    // procura um usuário existente pelo "e-mail" simulado (nome), senão cria um novo usuário fake
    let user = USERS.find(u=>u.name.toLowerCase()===email.toLowerCase());
    if(!user){
      user = {id:newId('u'), name:email, initials:initialsOf(email)};
      USERS.push(user);
    }
    if(members.some(m=>m.workspace_id===workspaceId && m.user_id===user.id)) return;
    setMembers(prev=>[...prev, {workspace_id:workspaceId, user_id:user.id, role:invitedRole, status:'invited'}]);
  }

  function toggleTask(taskId){
    if(!canEdit(role)) return;
    setTasks(prev=>prev.map(t=> t.id===taskId ? {...t, status: t.status==='done'?'pending':'done'} : t));
  }

  if(!role){
    return (
      <div className="empty-state" style={{marginTop:80}}>
        <div className="glyph">⊘</div>
        <p>Você não é membro deste workspace.</p>
      </div>
    );
  }

  return (
    <React.Fragment>
      <TopBar
        workspaceId={workspaceId} setWorkspaceId={setWorkspaceId}
        userId={userId} isMaster={isMaster}
        workspaceUserIds={workspaceUserIds} role={role}
        activeModule={activeModule} setActiveModule={setActiveModule}
        workspaceModules={workspaceModules}
        onLogout={onLogout}
      />
      <div style={{display: activeModule==='crm' ? 'block' : 'none'}}>
      <div className="app-body">
        <Sidebar page={page} setPage={setPage}
          counts={{
            pipeline: visibleOpps.filter(o=>o.status==='open').length,
            companies: visibleCompanies.length,
            contacts: wsContacts.filter(c=> canSeeAll(role) || c.owner_id===userId).length,
            tasks: visibleTasks.filter(t=>t.status==='pending').length,
          }}
          canManage={canManageWorkspace(role)}
        />
        <div className="main">
          {page==='pipeline' && (
            <PipelinePage
              pipeline={pipeline} stages={stages} opps={visibleOpps}
              onMove={moveOpportunity} onOpen={(id)=>setDrawer({type:'opportunity',id})}
              role={role} search={search} setSearch={setSearch}
              canEdit={canEdit(role)}
              onNew={()=>setOpportunityModal(true)}
            />
          )}
          {page==='companies' && (
            <CompaniesPage
              companies={visibleCompanies} contacts={wsContacts} opps={wsOpps}
              onOpen={(id)=>setDrawer({type:'company',id})}
              onNew={()=>setCompanyModal({mode:'new', id:null})}
              onEdit={(id)=>setCompanyModal({mode:'edit', id})}
              canEdit={canEdit(role)}
              search={search} setSearch={setSearch}
            />
          )}
          {page==='contacts' && (
            <ContactsPage
              contacts={wsContacts.filter(c=> canSeeAll(role) || c.owner_id===userId)}
              companies={wsCompanies}
              canEdit={canEdit(role)}
              search={search} setSearch={setSearch}
              onView={(id)=>setContactModal({mode:'view', id})}
              onEdit={(id)=>setContactModal({mode:'edit', id})}
              onNew={()=>setContactModal({mode:'new', id:null})}
            />
          )}
          {page==='tasks' && (
            <TasksPage tasks={visibleTasks} onToggle={toggleTask} canEdit={canEdit(role)} onNew={()=>setTaskModal(true)} />
          )}
          {page==='reports' && (
            <ReportsPage
              opps={wsOpps} tasks={wsTasks} companies={wsCompanies}
              workspaceUserIds={workspaceUserIds} role={role} userId={userId}
              workspaceName={WORKSPACES.find(w=>w.id===workspaceId)?.name}
            />
          )}
          {page==='team' && (
            <TeamPage workspaceId={workspaceId} canManage={canManageWorkspace(role)} members={members} onInvite={()=>setInviteModal(true)} />
          )}
          {page==='settings' && (
            <SettingsPage
              contractedIds={workspaceModules[workspaceId] || ["crm"]}
              onToggle={toggleModule}
              canManage={isMaster}
            />
          )}
        </div>
      </div>
      </div>

      <div style={{display: activeModule==='bot' ? 'block' : 'none'}}>
        <BotModule workspaceId={workspaceId} workspaceName={WORKSPACES.find(w=>w.id===workspaceId)?.name} userId={userId} />
      </div>
      <div style={{display: activeModule==='landing' ? 'block' : 'none'}}>
        <LandingModule url={WORKSPACE_LANDING_URL[workspaceId]} />
      </div>

      {drawer && (
        <DetailDrawer
          drawer={drawer} onClose={()=>setDrawer(null)}
          tasks={wsTasks} activities={wsActivities} contacts={wsContacts}
          onToggleTask={toggleTask} canEdit={canEdit(role)}
          onAddNote={(content)=>logActivity(drawer.id, drawer.type, content, 'note')}
        />
      )}

      {contactModal && (
        <ContactModal
          modal={contactModal} onClose={()=>setContactModal(null)}
          contact={contactModal.id ? wsContacts.find(c=>c.id===contactModal.id) : null}
          companies={wsCompanies} canEdit={canEdit(role)}
          onSave={(data)=>{ saveContact(data); setContactModal(null); }}
          onEditFromView={()=>setContactModal({mode:'edit', id:contactModal.id})}
        />
      )}

      {companyModal && (
        <CompanyModal
          modal={companyModal} onClose={()=>setCompanyModal(null)}
          company={companyModal.id ? wsCompanies.find(c=>c.id===companyModal.id) : null}
          onSave={(data)=>{ saveCompany(data); setCompanyModal(null); }}
        />
      )}

      {taskModal && (
        <TaskModal
          onClose={()=>setTaskModal(null)}
          companies={wsCompanies} contacts={wsContacts}
          memberIds={workspaceUserIds}
          onSave={(data)=>{ saveTask(data); setTaskModal(null); }}
        />
      )}

      {opportunityModal && (
        <OpportunityModal
          onClose={()=>setOpportunityModal(null)}
          companies={wsCompanies} contacts={wsContacts} stages={stages}
          memberIds={workspaceUserIds}
          onSave={(data)=>{ saveOpportunity(data); setOpportunityModal(null); }}
        />
      )}

      {inviteModal && (
        <InviteModal
          onClose={()=>setInviteModal(null)}
          onInvite={(email, invitedRole)=>{ inviteMember(email, invitedRole); setInviteModal(null); }}
        />
      )}
    </React.Fragment>
  );
}

/* ---------------- Top bar ---------------- */
function TopBar({workspaceId, setWorkspaceId, userId, isMaster, workspaceUserIds, role, activeModule, setActiveModule, workspaceModules, onLogout}){
  const [showNotif, setShowNotif] = useState(false);
  const contractedIds = workspaceModules[workspaceId] || ["crm"];
  // o Admin Master enxerga sempre as três abas (mesmo módulos não contratados)
  // pois é ele quem decide, na tela de Configurações, o que cada empresa tem ativo.
  const contractedModules = isMaster ? MODULE_DEFS : MODULE_DEFS.filter(m=>contractedIds.includes(m.id));
  const currentUser = userById(userId);
  const currentCompany = WORKSPACES.find(w=>w.id===workspaceId);

  return (
    <div className="topbar">
      <div className="brand">
        <div className="mark">N</div>
        <div className="brand-name">Nexo CRM</div>
      </div>

      {contractedModules.length > 0 && (
        <div className="module-tabs">
          {contractedModules.map(m=>(
            <button key={m.id} className={"module-tab"+(activeModule===m.id?' active':'')}
              onClick={()=>setActiveModule(m.id)}>
              <span>{m.icon}</span> {m.label}
            </button>
          ))}
        </div>
      )}

      <div className="topbar-right">
        {isMaster ? (
          // só o Admin Master pode trocar de empresa dentro da sessão —
          // cada empresa tem seu próprio login para os demais usuários.
          <div className="select-pill">
            <span>empresa</span>
            <select value={workspaceId} onChange={e=>setWorkspaceId(e.target.value)}>
              {WORKSPACES.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
        ) : (
          <div className="select-pill" style={{cursor:'default'}}>
            <span>empresa</span>
            <span style={{fontFamily:'var(--mono)',fontSize:13}}>{currentCompany?.name}</span>
          </div>
        )}
        <span className="role-badge" style={isMaster?{background:'var(--accent)',color:'#fff'}:null}>
          {isMaster ? 'Admin Master' : ROLE_LABEL[role]}
        </span>
        <span style={{fontSize:13,color:'var(--paper)',opacity:.85}}>{currentUser?.name}</span>
        <div style={{position:'relative'}}>
          <button className="icon-btn" onClick={()=>setShowNotif(s=>!s)} title="Notificações">
            Notificações
            <span className="notif-dot"></span>
          </button>
          {showNotif && (
            <div style={{
              position:'absolute',right:0,top:44,width:260,background:'var(--card)',color:'var(--ink)',
              border:'1px solid var(--line)',borderRadius:10,padding:12,boxShadow:'0 8px 24px rgba(0,0,0,.15)',
              fontSize:12.5, zIndex:50
            }}>
              <div style={{fontWeight:700,marginBottom:8,fontFamily:'var(--serif)',fontSize:14}}>Notificações</div>
              <div style={{padding:'6px 0',borderBottom:'1px solid var(--line)'}}>3 negócios com ação pendente hoje</div>
              <div style={{padding:'6px 0',borderBottom:'1px solid var(--line)'}}>1 tarefa atrasada</div>
              <div style={{padding:'6px 0'}}>2 negócios sem contato há mais de 3 dias</div>
            </div>
          )}
        </div>
        <button className="icon-btn" title="Sair" onClick={onLogout}>⏻</button>
      </div>
    </div>
  );
}

/* ---------------- Sidebar ---------------- */
function Sidebar({page, setPage, counts, canManage}){
  const items = [
    {id:'pipeline', label:'Pipeline', count:counts.pipeline},
    {id:'companies', label:'Empresas', count:counts.companies},
    {id:'contacts', label:'Contatos', count:counts.contacts},
    {id:'tasks', label:'Tarefas', count:counts.tasks},
    {id:'reports', label:'Relatórios', count:null},
    {id:'team', label:'Equipe', count:null},
  ];
  if(canManage) items.push({id:'settings', label:'Configurações', count:null});
  return (
    <div className="sidebar">
      {items.map(it=>(
        <div key={it.id} className={"nav-item"+(page===it.id?' active':'')} onClick={()=>setPage(it.id)}>
          {it.label}
          {it.count!==null && <span className="nav-count">{it.count}</span>}
        </div>
      ))}
      <div className="sidebar-footer">
        isolamento ativo por<br/>workspace_id · {canManage ? 'permissões de gestão' : 'acesso restrito'}
      </div>
    </div>
  );
}

/* ---------------- Pipeline (Kanban) ---------------- */
function PipelinePage({pipeline, stages, opps, onMove, onOpen, role, search, setSearch, canEdit, onNew}){
  const [draggedId, setDraggedId] = useState(null);
  const [overStage, setOverStage] = useState(null);
  const [overZone, setOverZone] = useState(null); // 'won' | 'lost'
  const [view, setView] = useState('kanban');
  const [period, setPeriod] = useState('30');

  if(!pipeline){
    return <div className="empty-state"><div className="glyph">◇</div><p>Nenhum funil configurado ainda.</p></div>;
  }

  const wonStage = stages.find(s=>s.is_won);
  const lostStage = stages.find(s=>s.is_lost);
  const openStages = stages.filter(s=>!s.is_won && !s.is_lost);

  const filtered = opps.filter(o=> o.title.toLowerCase().includes(search.toLowerCase()) ||
    (companyById(o.company_id)?.name||'').toLowerCase().includes(search.toLowerCase()));

  const openOpps = opps.filter(o=>o.status==='open');
  const openTotal = openOpps.reduce((s,o)=>s+o.value,0);
  const wonTotal = opps.filter(o=>o.status==='won').reduce((s,o)=>s+o.value,0);
  const weighted = openOpps.reduce((s,o)=>{
    const st = stages.find(s=>s.id===o.stage_id);
    return s + o.value * ((st?.probability||0)/100);
  },0);
  const totalCount = opps.length || 1;
  const wonCount = opps.filter(o=>o.status==='won').length;
  const overallConv = Math.round((wonCount/totalCount)*100);

  function conversionForStage(stage){
    // % dos negócios que chegaram nessa etapa ou além, em relação ao total do funil
    const order = stage.order;
    const reached = opps.filter(o=>{
      const st = stages.find(s=>s.id===o.stage_id);
      return st && st.order >= order && !st.is_lost;
    }).length;
    return Math.round((reached/totalCount)*100);
  }

  return (
    <React.Fragment>
      <div className="page-head">
        <div>
          <h1 className="page-title">Negócios</h1>
          <div className="page-sub">
            {role==='sales_rep' ? 'Mostrando só os seus negócios' : 'Todos os negócios da equipe'}
          </div>
        </div>
        <button className="btn btn-primary" disabled={!canEdit} onClick={onNew}>+ Novo negócio</button>
      </div>

      <div className="stat-strip">
        <div className="stat-box"><div className="num">{fmtBRL(openTotal)}</div><div className="lab">Em andamento</div></div>
        <div className="stat-box"><div className="num">{fmtBRL(weighted)}</div><div className="lab">Previsão de fechamento</div></div>
        <div className="stat-box"><div className="num">{fmtBRL(wonTotal)}</div><div className="lab">Já vendido</div></div>
        <div className="stat-box"><div className="num">{overallConv}%</div><div className="lab">Taxa de conversão</div></div>
      </div>

      <div className="toolbar">
        <div className="search-wrap">
          <span className="lupa">Buscar</span>
          <input className="searchbar" placeholder="Buscar negócio ou empresa…" value={search} onChange={e=>setSearch(e.target.value)} />
        </div>

        <select className="select-control" value={period} onChange={e=>setPeriod(e.target.value)}>
          <option value="7">Últimos 7 dias</option>
          <option value="30">Últimos 30 dias</option>
          <option value="90">Últimos 90 dias</option>
          <option value="all">Todo o período</option>
        </select>

        <div className="view-toggle" style={{marginLeft:'auto'}}>
          <button className={view==='kanban'?'active':''} onClick={()=>setView('kanban')}>Kanban</button>
          <button className={view==='list'?'active':''} onClick={()=>setView('list')}>Lista</button>
        </div>
      </div>

      {view==='kanban' ? (
        <div className="kanban-wrap">
          {openStages.map(stage=>{
            const stageOpps = filtered.filter(o=>o.stage_id===stage.id);
            const stageTotal = stageOpps.reduce((s,o)=>s+o.value,0);
            return (
              <div key={stage.id}
                className={"kanban-col"+(overStage===stage.id?' drag-over':'')}
                onDragOver={(e)=>{e.preventDefault(); setOverStage(stage.id);}}
                onDragLeave={()=>setOverStage(null)}
                onDrop={()=>{ if(draggedId) onMove(draggedId, stage.id); setDraggedId(null); setOverStage(null);}}
              >
                <div className="kanban-col-head">
                  <b>{stage.name}</b>
                  <span className="conv">{conversionForStage(stage)}%</span>
                </div>
                <div className="stage-total" style={{marginBottom:8}}>{fmtBRL(stageTotal)} · {stageOpps.length}</div>
                <div className="kanban-cards">
                  {stageOpps.map(o=>{
                    const company = companyById(o.company_id);
                    const owner = userById(o.owner_id);
                    const prioColor = PRIORITY_COLOR[o.priority] || PRIORITY_COLOR.low;
                    const inactive = o.last_contact_days >= 3;
                    return (
                      <div key={o.id} className="deal-card" draggable
                        onDragStart={()=>setDraggedId(o.id)}
                        onDragEnd={()=>setDraggedId(null)}
                        onClick={()=>onOpen(o.id)}
                      >
                        <span className="prio-strip" style={{background:prioColor}}></span>
                        <div className="deal-top-row">
                          <span className="priority-dot lg" style={{background:prioColor}}></span>
                          <span className="deal-title" style={{marginBottom:0}}>{o.title}</span>
                        </div>
                        <div className="deal-company">{company?.name}</div>
                        <div className="deal-meta">
                          <span className="deal-value">{fmtBRL(o.value)}</span>
                          <span className="avatar" title={owner?.name}>{owner?.initials}</span>
                        </div>
                        {o.next_action && (
                          <div className="next-action">{o.next_action}</div>
                        )}
                        <div className={"inactivity-tag"+(inactive?'':' ok')}>
                          {o.last_contact_days===0 ? 'contato hoje' : `sem contato há ${o.last_contact_days}d`}
                        </div>
                      </div>
                    );
                  })}
                  {stageOpps.length===0 && <div style={{fontSize:12,color:'var(--muted)',padding:'6px 4px'}}>Nada por aqui</div>}
                </div>

                {stage.order === openStages[openStages.length-1].order && (
                  <div className="drop-zones">
                    <div
                      className={"drop-zone won"+(overZone==='won'?' drag-over':'')}
                      onDragOver={(e)=>{e.preventDefault(); setOverZone('won');}}
                      onDragLeave={()=>setOverZone(null)}
                      onDrop={()=>{ if(draggedId && wonStage) onMove(draggedId, wonStage.id); setDraggedId(null); setOverZone(null);}}
                    >Ganho</div>
                    <div
                      className={"drop-zone lost"+(overZone==='lost'?' drag-over':'')}
                      onDragOver={(e)=>{e.preventDefault(); setOverZone('lost');}}
                      onDragLeave={()=>setOverZone(null)}
                      onDrop={()=>{ if(draggedId && lostStage) onMove(draggedId, lostStage.id); setDraggedId(null); setOverZone(null);}}
                    >Perdido</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="panel">
          <table className="data-table">
            <thead><tr><th>Negócio</th><th>Empresa</th><th>Etapa</th><th>Prioridade</th><th>Próxima ação</th><th>Valor</th><th>Dono</th></tr></thead>
            <tbody>
              {filtered.map(o=>{
                const company = companyById(o.company_id);
                const owner = userById(o.owner_id);
                const stage = stages.find(s=>s.id===o.stage_id);
                const prioColor = PRIORITY_COLOR[o.priority] || PRIORITY_COLOR.low;
                return (
                  <tr key={o.id} className="row-clickable" onClick={()=>onOpen(o.id)}>
                    <td><b>{o.title}</b></td>
                    <td>{company?.name}</td>
                    <td><span className="tag">{stage?.name}</span></td>
                    <td><span className="priority-dot lg" style={{background:prioColor, display:'inline-block'}}></span></td>
                    <td style={{fontSize:12.5,color:'var(--muted)'}}>{o.next_action ? o.next_action : '—'}</td>
                    <td className="deal-value">{fmtBRL(o.value)}</td>
                    <td>
                      <div className="owner-cell"><span className="avatar">{owner?.initials}</span>{owner?.name}</div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length===0 && (
                <tr><td colSpan="7"><div className="empty-state"><div className="glyph">◇</div>Nenhum negócio encontrado.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </React.Fragment>
  );
}

/* ---------------- Companies ---------------- */
function CompaniesPage({companies, contacts, opps, onOpen, onNew, onEdit, canEdit, search, setSearch}){
  const filtered = companies.filter(c=>c.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <React.Fragment>
      <div className="page-head">
        <div>
          <h1 className="page-title">Empresas</h1>
          <div className="page-sub">Contas do workspace, com dono e volume em pipeline</div>
        </div>
        <button className="btn btn-primary" disabled={!canEdit} onClick={onNew}>+ Nova empresa</button>
      </div>
      {!canEdit && <div className="locked-banner">Seu papel é Viewer — você pode ver as empresas, mas não criar nem editar.</div>}
      <div className="toolbar">
        <input className="searchbar" placeholder="Buscar empresa…" value={search} onChange={e=>setSearch(e.target.value)} />
      </div>
      <div className="panel">
        <table className="data-table">
          <thead><tr><th>Empresa</th><th>Segmento</th><th>Contatos</th><th>Dono</th><th>Em pipeline</th><th></th></tr></thead>
          <tbody>
            {filtered.map(c=>{
              const compContacts = contacts.filter(x=>x.company_id===c.id);
              const compOpps = opps.filter(o=>o.company_id===c.id && o.status==='open');
              const total = compOpps.reduce((s,o)=>s+o.value,0);
              const owner = userById(c.owner_id);
              return (
                <tr key={c.id} className="row-clickable" onClick={()=>onOpen(c.id)}>
                  <td><b>{c.name}</b></td>
                  <td><span className="tag">{c.segment}</span></td>
                  <td>{compContacts.length}</td>
                  <td>
                    <div className="owner-cell">
                      <span className="avatar">{owner?.initials}</span>
                      {owner?.name}
                    </div>
                  </td>
                  <td>{total>0 ? fmtBRL(total) : '—'}</td>
                  <td style={{textAlign:'right'}}>
                    <button className="btn btn-ghost" style={{padding:'5px 10px',fontSize:12}}
                      onClick={(e)=>{ e.stopPropagation(); onEdit(c.id); }} disabled={!canEdit}>
                      Editar
                    </button>
                  </td>
                </tr>
              );
            })}
            {filtered.length===0 && (
              <tr><td colSpan="6"><div className="empty-state"><div className="glyph">◇</div>Nenhuma empresa encontrada.</div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </React.Fragment>
  );
}

/* ---------------- Company Modal (novo / editar) ---------------- */
function CompanyModal({modal, onClose, company, onSave}){
  const isNew = modal.mode==='new';
  const [form, setForm] = useState(()=> company ? {...company} : {
    name:'', segment:'', size:'11-50', cnpj:'', phone:'', email:''
  });
  function update(field,val){ setForm(prev=>({...prev,[field]:val})); }
  function handleSave(){
    if(!form.name.trim()) return;
    onSave({...form, id: company ? company.id : undefined});
  }
  return (
    <div className="overlay" onClick={onClose}>
      <div className="drawer" onClick={e=>e.stopPropagation()} style={{width:400}}>
        <button className="drawer-close" onClick={onClose}>✕</button>
        <h2>{isNew ? 'Nova empresa' : 'Editar empresa'}</h2>
        <div style={{color:'var(--muted)',fontSize:13,marginBottom:18}}>Dados da conta/cliente</div>

        <div className="field">
          <label>Nome da empresa</label>
          <input className="modal-input" value={form.name} onChange={e=>update('name', e.target.value)} placeholder="Razão social ou nome fantasia" />
        </div>
        <div className="field">
          <label>Segmento</label>
          <input className="modal-input" value={form.segment} onChange={e=>update('segment', e.target.value)} placeholder="Ex: Indústria, Varejo…" />
        </div>
        <div className="field">
          <label>Porte</label>
          <select className="modal-input" value={form.size} onChange={e=>update('size', e.target.value)}>
            <option value="1-10">1-10 funcionários</option>
            <option value="11-50">11-50 funcionários</option>
            <option value="51-200">51-200 funcionários</option>
            <option value="200+">200+ funcionários</option>
          </select>
        </div>
        <div className="field">
          <label>CNPJ</label>
          <input className="modal-input" value={form.cnpj||''} onChange={e=>update('cnpj', e.target.value)} placeholder="00.000.000/0001-00" />
        </div>
        <div className="field">
          <label>Telefone geral</label>
          <input className="modal-input" value={form.phone||''} onChange={e=>update('phone', e.target.value)} placeholder="(00) 0000-0000" />
        </div>
        <div className="field">
          <label>E-mail geral</label>
          <input className="modal-input" type="email" value={form.email||''} onChange={e=>update('email', e.target.value)} placeholder="contato@empresa.com" />
        </div>
        <button className="btn btn-primary" style={{marginTop:6}} onClick={handleSave}>
          {isNew ? 'Criar empresa' : 'Salvar alterações'}
        </button>
      </div>
    </div>
  );
}

/* ---------------- Contacts ---------------- */
function ContactsPage({contacts, companies, canEdit, search, setSearch, onView, onEdit, onNew}){
  const filtered = contacts.filter(c=>c.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <React.Fragment>
      <div className="page-head">
        <div>
          <h1 className="page-title">Contatos</h1>
          <div className="page-sub">Pessoas ligadas às empresas deste workspace</div>
        </div>
        <button className="btn btn-primary" disabled={!canEdit} onClick={onNew}>+ Novo contato</button>
      </div>
      {!canEdit && <div className="locked-banner">Seu papel é Viewer — você pode ver os contatos, mas não criar nem editar.</div>}
      <div className="toolbar">
        <input className="searchbar" placeholder="Buscar contato…" value={search} onChange={e=>setSearch(e.target.value)} />
      </div>
      <div className="panel">
        <table className="data-table">
          <thead><tr><th>Nome</th><th>Cargo</th><th>Empresa</th><th>E-mail</th><th></th></tr></thead>
          <tbody>
            {filtered.map(c=>{
              const comp = companyById(c.company_id);
              return (
                <tr key={c.id} className="row-clickable" onClick={()=>onView(c.id)}>
                  <td className="owner-cell"><span className="avatar">{initialsOf(c.name)}</span><b>{c.name}</b></td>
                  <td>{c.role_title}</td>
                  <td>{comp?.name || <span className="tag">sem empresa</span>}</td>
                  <td style={{color:'var(--muted)'}}>{c.email}</td>
                  <td style={{textAlign:'right'}}>
                    <button className="btn btn-ghost" style={{padding:'5px 10px',fontSize:12}}
                      onClick={(e)=>{ e.stopPropagation(); onEdit(c.id); }} disabled={!canEdit}>
                      Editar
                    </button>
                  </td>
                </tr>
              );
            })}
            {filtered.length===0 && (
              <tr><td colSpan="5"><div className="empty-state"><div className="glyph">◇</div>Nenhum contato encontrado.</div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </React.Fragment>
  );
}

/* ---------------- Contact Modal (ver / criar / editar) ---------------- */
function ContactModal({modal, onClose, contact, companies, canEdit, onSave, onEditFromView}){
  const isNew = modal.mode==='new';
  const isView = modal.mode==='view';
  const [form, setForm] = useState(()=> contact ? {...contact} : {
    name:'', role_title:'', company_id:companies[0]?.id||'', email:'', phone:'', cpf:''
  });

  function update(field, val){ setForm(prev=>({...prev, [field]:val})); }

  function handleSave(){
    if(!form.name.trim()) return;
    onSave({...form, id: contact ? contact.id : undefined});
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="drawer" onClick={e=>e.stopPropagation()} style={{width:400}}>
        <button className="drawer-close" onClick={onClose}>✕</button>
        <h2>{isNew ? 'Novo contato' : isView ? contact.name : 'Editar contato'}</h2>
        <div style={{color:'var(--muted)',fontSize:13,marginBottom:18}}>
          {isNew ? 'Preencha os dados da pessoa' : (companyById(form.company_id)?.name || 'Sem empresa vinculada')}
        </div>

        {isView ? (
          <React.Fragment>
            <div className="field"><label>Cargo</label><div className="field-value">{contact.role_title || '—'}</div></div>
            <div className="field"><label>Empresa</label><div className="field-value">{companyById(contact.company_id)?.name || '—'}</div></div>
            <div className="field"><label>Telefone</label><div className="field-value">{contact.phone || '—'}</div></div>
            <div className="field"><label>E-mail</label><div className="field-value">{contact.email || '—'}</div></div>
            <div className="field"><label>CPF</label><div className="field-value">{contact.cpf || '—'}</div></div>
            {canEdit && (
              <button className="btn btn-primary" style={{marginTop:6}} onClick={onEditFromView}>Editar contato</button>
            )}
          </React.Fragment>
        ) : (
          <React.Fragment>
            <div className="field">
              <label>Nome</label>
              <input className="modal-input" value={form.name} onChange={e=>update('name', e.target.value)} placeholder="Nome completo" />
            </div>
            <div className="field">
              <label>Cargo</label>
              <input className="modal-input" value={form.role_title} onChange={e=>update('role_title', e.target.value)} placeholder="Ex: Compras" />
            </div>
            <div className="field">
              <label>Empresa</label>
              <select className="modal-input" value={form.company_id} onChange={e=>update('company_id', e.target.value)}>
                <option value="">Sem empresa</option>
                {companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Telefone</label>
              <input className="modal-input" value={form.phone} onChange={e=>update('phone', e.target.value)} placeholder="(00) 00000-0000" />
            </div>
            <div className="field">
              <label>E-mail</label>
              <input className="modal-input" type="email" value={form.email} onChange={e=>update('email', e.target.value)} placeholder="nome@empresa.com" />
            </div>
            <div className="field">
              <label>CPF</label>
              <input className="modal-input" value={form.cpf} onChange={e=>update('cpf', e.target.value)} placeholder="000.000.000-00" />
            </div>
            <button className="btn btn-primary" style={{marginTop:6}} onClick={handleSave}>
              {isNew ? 'Criar contato' : 'Salvar alterações'}
            </button>
          </React.Fragment>
        )}
      </div>
    </div>
  );
}

/* ---------------- Tasks ---------------- */
function TasksPage({tasks, onToggle, canEdit, onNew}){
  const sorted = [...tasks].sort((a,b)=> (a.status==='done')-(b.status==='done') || new Date(a.due_date)-new Date(b.due_date));
  const today = new Date('2026-08-11');
  return (
    <React.Fragment>
      <div className="page-head">
        <div>
          <h1 className="page-title">Tarefas</h1>
          <div className="page-sub">Atribuídas a você{canEdit? '' : ' · somente leitura (papel viewer)'}</div>
        </div>
        <button className="btn btn-primary" disabled={!canEdit} onClick={onNew}>+ Nova tarefa</button>
      </div>
      {!canEdit && <div className="locked-banner">Seu papel é Viewer — você pode visualizar tarefas, mas não concluí-las nem criar novas.</div>}
      <div className="panel" style={{padding:'6px 16px'}}>
        {sorted.map(t=>{
          const overdue = t.status==='pending' && new Date(t.due_date) < today;
          const assignee = userById(t.assignee_id);
          return (
            <div key={t.id} className={"task-row"+(t.status==='done'?' done':'')}>
              <div className={"checkbox"+(t.status==='done'?' checked':'')} onClick={()=>canEdit && onToggle(t.id)}>
                {t.status==='done' ? '✓' : ''}
              </div>
              <div className="priority-dot" style={{background:PRIORITY_COLOR[t.priority]}}></div>
              <div style={{flex:1}}>
                <div className="task-title" style={{fontSize:13.5,fontWeight:500}}>{t.title}</div>
                <div style={{fontSize:11.5,color:'var(--muted)'}}>{t.related_to_type} · {assignee?.name}</div>
              </div>
              <div style={{fontFamily:'var(--mono)',fontSize:12,color: overdue?'var(--red)':'var(--muted)'}}>
                {overdue ? 'atrasada · ' : ''}{fmtDate(t.due_date)}
              </div>
            </div>
          );
        })}
        {sorted.length===0 && <div className="empty-state"><div className="glyph">◇</div>Nenhuma tarefa por aqui.</div>}
      </div>
    </React.Fragment>
  );
}

/* ---------------- Task Modal (nova tarefa) ---------------- */
function TaskModal({onClose, companies, contacts, memberIds, onSave}){
  const [form, setForm] = useState({
    title:'', due_date:'2026-08-15', priority:'medium',
    assignee_id: memberIds[0]||'', related_to_type:'company', related_to_id: companies[0]?.id||''
  });
  function update(field,val){ setForm(prev=>({...prev,[field]:val})); }

  const relatedOptions = form.related_to_type==='company' ? companies
    : form.related_to_type==='contact' ? contacts : [];

  function handleSave(){
    if(!form.title.trim()) return;
    onSave(form);
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="drawer" onClick={e=>e.stopPropagation()} style={{width:400}}>
        <button className="drawer-close" onClick={onClose}>✕</button>
        <h2>Nova tarefa</h2>
        <div style={{color:'var(--muted)',fontSize:13,marginBottom:18}}>O que precisa ser feito e até quando</div>

        <div className="field">
          <label>Título</label>
          <input className="modal-input" value={form.title} onChange={e=>update('title', e.target.value)} placeholder="Ex: Ligar para o cliente" />
        </div>
        <div className="field">
          <label>Prazo</label>
          <input className="modal-input" type="date" value={form.due_date} onChange={e=>update('due_date', e.target.value)} />
        </div>
        <div className="field">
          <label>Prioridade</label>
          <select className="modal-input" value={form.priority} onChange={e=>update('priority', e.target.value)}>
            <option value="high">Alta</option>
            <option value="medium">Média</option>
            <option value="low">Baixa</option>
          </select>
        </div>
        <div className="field">
          <label>Responsável</label>
          <select className="modal-input" value={form.assignee_id} onChange={e=>update('assignee_id', e.target.value)}>
            {memberIds.map(id=><option key={id} value={id}>{userById(id)?.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Relacionada a</label>
          <select className="modal-input" value={form.related_to_type}
            onChange={e=>update('related_to_type', e.target.value)}>
            <option value="company">Empresa</option>
            <option value="contact">Contato</option>
          </select>
        </div>
        <div className="field">
          <label>{form.related_to_type==='company' ? 'Qual empresa' : 'Qual contato'}</label>
          <select className="modal-input" value={form.related_to_id} onChange={e=>update('related_to_id', e.target.value)}>
            {relatedOptions.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>

        <button className="btn btn-primary" style={{marginTop:6}} onClick={handleSave}>Criar tarefa</button>
      </div>
    </div>
  );
}

/* ---------------- Team ---------------- */
function TeamPage({workspaceId, canManage, members, onInvite}){
  const wsMembers = members.filter(m=>m.workspace_id===workspaceId);
  return (
    <React.Fragment>
      <div className="page-head">
        <div>
          <h1 className="page-title">Equipe</h1>
          <div className="page-sub">Membros deste workspace e seus papéis</div>
        </div>
        <button className="btn btn-primary" disabled={!canManage} onClick={onInvite}>+ Convidar</button>
      </div>
      {!canManage && <div className="locked-banner">Apenas Owner ou Admin podem convidar ou alterar papéis de membros.</div>}
      <div className="panel">
        <table className="data-table">
          <thead><tr><th>Membro</th><th>Papel</th><th>Status</th><th>Visibilidade de dados</th></tr></thead>
          <tbody>
            {wsMembers.map(m=>{
              const u = userById(m.user_id);
              return (
                <tr key={m.user_id}>
                  <td className="owner-cell"><span className="avatar">{u.initials}</span>{u.name}</td>
                  <td><span className="role-badge" style={{background:'var(--accent-soft)',color:'var(--accent)'}}>{ROLE_LABEL[m.role]}</span></td>
                  <td><span className="tag">{m.status==='invited' ? 'Convite pendente' : 'Ativo'}</span></td>
                  <td style={{color:'var(--muted)',fontSize:12.5}}>
                    {canSeeAll(m.role) ? 'Todos os registros do workspace' : 'Apenas registros dos quais é dono'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </React.Fragment>
  );
}

/* ---------------- Settings (módulos contratados) ---------------- */
function SettingsPage({contractedIds, onToggle, canManage}){
  return (
    <React.Fragment>
      <div className="page-head">
        <div>
          <h1 className="page-title">Configurações</h1>
          <div className="page-sub">Módulos contratados por este workspace</div>
        </div>
      </div>
      {!canManage && <div className="locked-banner">Apenas Owner ou Admin podem alterar os módulos contratados.</div>}
      <div className="panel" style={{padding:6}}>
        {MODULE_DEFS.map(m=>{
          const active = contractedIds.includes(m.id);
          const isCore = m.id==='crm';
          return (
            <div key={m.id} style={{
              display:'flex',alignItems:'center',gap:14,padding:'14px 16px',
              borderBottom:'1px solid var(--line)'
            }}>
              <span style={{fontSize:22}}>{m.icon}</span>
              <div style={{flex:1}}>
                <div style={{fontWeight:600,fontSize:14}}>{m.label}</div>
                <div style={{fontSize:12,color:'var(--muted)'}}>
                  {isCore ? 'Módulo principal — sempre incluído' : active ? 'Contratado — visível no header' : 'Não contratado — oculto para os usuários'}
                </div>
              </div>
              <label style={{display:'flex',alignItems:'center',gap:8,cursor: canManage && !isCore ? 'pointer':'default'}}>
                <input type="checkbox" checked={active} disabled={!canManage || isCore}
                  onChange={()=>onToggle(m.id)}
                  style={{width:18,height:18,accentColor:'#2c5f4f'}} />
              </label>
            </div>
          );
        })}
      </div>
    </React.Fragment>
  );
}

/* ---------------- Invite Modal ---------------- */
function InviteModal({onClose, onInvite}){
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('sales_rep');

  function handleSave(){
    if(!email.trim()) return;
    onInvite(email.trim(), role);
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="drawer" onClick={e=>e.stopPropagation()} style={{width:380}}>
        <button className="drawer-close" onClick={onClose}>✕</button>
        <h2>Convidar membro</h2>
        <div style={{color:'var(--muted)',fontSize:13,marginBottom:18}}>Adicione um novo usuário a este workspace</div>

        <div className="field">
          <label>Nome ou e-mail</label>
          <input className="modal-input" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="pessoa@empresa.com" />
        </div>
        <div className="field">
          <label>Papel</label>
          <select className="modal-input" value={role} onChange={e=>setRole(e.target.value)}>
            <option value="admin">Admin</option>
            <option value="manager">Manager</option>
            <option value="sales_rep">Sales Rep</option>
            <option value="viewer">Viewer</option>
          </select>
        </div>

        <button className="btn btn-primary" style={{marginTop:6}} onClick={handleSave}>Enviar convite</button>
      </div>
    </div>
  );
}

/* ---------------- Reports ---------------- */
function ReportsPage({opps, tasks, companies, workspaceUserIds, role, userId, workspaceName}){
  const [mode, setMode] = useState('month'); // 'day' | 'month' | 'range'
  const today = new Date('2026-08-13');
  const [day, setDay] = useState('2026-08-13');
  const [month, setMonth] = useState('2026-08');
  const [rangeStart, setRangeStart] = useState('2026-07-01');
  const [rangeEnd, setRangeEnd] = useState('2026-08-13');
  const [preview, setPreview] = useState(null);

  function inRange(dateStr){
    if(!dateStr) return false;
    const d = new Date(dateStr);
    if(mode==='day'){
      return dateStr === day;
    }
    if(mode==='month'){
      return dateStr.slice(0,7) === month;
    }
    // range
    return d >= new Date(rangeStart) && d <= new Date(rangeEnd);
  }

  function periodLabel(){
    if(mode==='day') return `Dia ${fmtDate(day)}`;
    if(mode==='month'){
      const [y,m] = month.split('-');
      const nomes = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
      return `${nomes[parseInt(m,10)-1]} de ${y}`;
    }
    return `${fmtDate(rangeStart)} a ${fmtDate(rangeEnd)}`;
  }

  function buildReport(){
    // Negócios criados no período (pipeline)
    const createdInPeriod = opps.filter(o=>inRange(o.created_at));
    // Negócios fechados (ganho ou perdido) no período
    const closedInPeriod = opps.filter(o=>o.closed_at && inRange(o.closed_at));
    const wonInPeriod = closedInPeriod.filter(o=>o.status==='won');
    const lostInPeriod = closedInPeriod.filter(o=>o.status==='lost');

    const totalWon = wonInPeriod.reduce((s,o)=>s+o.value,0);
    const totalLost = lostInPeriod.reduce((s,o)=>s+o.value,0);
    const totalCreated = createdInPeriod.reduce((s,o)=>s+o.value,0);
    const winRate = closedInPeriod.length ? Math.round((wonInPeriod.length/closedInPeriod.length)*100) : 0;
    const ticketMedio = wonInPeriod.length ? totalWon/wonInPeriod.length : 0;

    const lines = [];
    lines.push('='.repeat(58));
    lines.push('RELATORIO COMERCIAL - ' + (workspaceName||'').toUpperCase());
    lines.push('='.repeat(58));
    lines.push('Periodo: ' + periodLabel());
    lines.push('Gerado em: ' + today.toLocaleDateString('pt-BR') + ' ' + '11:00');
    lines.push('');
    lines.push('-'.repeat(58));
    lines.push('RESUMO FINANCEIRO');
    lines.push('-'.repeat(58));
    lines.push('Negocios criados no periodo: ' + createdInPeriod.length + '  (' + fmtBRL(totalCreated) + ')');
    lines.push('Negocios fechados (ganhos):  ' + wonInPeriod.length + '  (' + fmtBRL(totalWon) + ')');
    lines.push('Negocios perdidos:           ' + lostInPeriod.length + '  (' + fmtBRL(totalLost) + ')');
    lines.push('Taxa de conversao no periodo: ' + winRate + '%');
    lines.push('Ticket medio (ganhos):        ' + fmtBRL(ticketMedio));
    lines.push('');
    lines.push('-'.repeat(58));
    lines.push('DESEMPENHO POR ATENDENTE');
    lines.push('-'.repeat(58));

    workspaceUserIds.forEach(uid=>{
      const u = userById(uid);
      const userWon = wonInPeriod.filter(o=>o.owner_id===uid);
      const userLost = lostInPeriod.filter(o=>o.owner_id===uid);
      const userCreated = createdInPeriod.filter(o=>o.owner_id===uid);
      const userTotal = userWon.reduce((s,o)=>s+o.value,0);
      if(userCreated.length===0 && userWon.length===0 && userLost.length===0) return;
      lines.push('');
      lines.push(u.name);
      lines.push('  Negocios criados:  ' + userCreated.length);
      lines.push('  Contratos fechados: ' + userWon.length + '  (' + fmtBRL(userTotal) + ')');
      lines.push('  Negocios perdidos:  ' + userLost.length);
      if(userWon.length){
        lines.push('  Detalhe dos fechamentos:');
        userWon.forEach(o=>{
          const company = companyById(o.company_id);
          lines.push('    - ' + o.title + ' | ' + (company?.name||'-') + ' | ' + fmtBRL(o.value) + ' | fechado em ' + fmtDate(o.closed_at));
        });
      }
    });

    lines.push('');
    lines.push('-'.repeat(58));
    lines.push('NEGOCIOS FECHADOS NO PERIODO (DETALHADO)');
    lines.push('-'.repeat(58));
    if(closedInPeriod.length===0){
      lines.push('Nenhum negocio fechado neste periodo.');
    } else {
      closedInPeriod.forEach(o=>{
        const company = companyById(o.company_id);
        const owner = userById(o.owner_id);
        lines.push([
          fmtDate(o.closed_at),
          o.status==='won' ? 'GANHO' : 'PERDIDO',
          o.title,
          company?.name||'-',
          owner?.name||'-',
          fmtBRL(o.value)
        ].join(' | '));
      });
    }

    lines.push('');
    lines.push('='.repeat(58));
    lines.push('Fim do relatorio.');

    return lines.join('\n');
  }

  function downloadReport(){
    const content = buildReport();
    const blob = new Blob([content], {type:'text/plain;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const suffix = mode==='day' ? day : mode==='month' ? month : rangeStart+'_a_'+rangeEnd;
    a.href = url;
    a.download = 'relatorio-comercial-' + suffix + '.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <React.Fragment>
      <div className="page-head">
        <div>
          <h1 className="page-title">Relatórios</h1>
          <div className="page-sub">Financeiro do periodo e desempenho de cada atendente</div>
        </div>
      </div>

      <div className="panel" style={{padding:18,marginBottom:18}}>
        <div className="toolbar" style={{marginBottom:6}}>
          <div className="view-toggle">
            <button className={mode==='day'?'active':''} onClick={()=>setMode('day')}>Dia</button>
            <button className={mode==='month'?'active':''} onClick={()=>setMode('month')}>Mês</button>
            <button className={mode==='range'?'active':''} onClick={()=>setMode('range')}>Período</button>
          </div>

          {mode==='day' && (
            <input className="modal-input" type="date" style={{width:170}} value={day} onChange={e=>setDay(e.target.value)} />
          )}
          {mode==='month' && (
            <input className="modal-input" type="month" style={{width:170}} value={month} onChange={e=>setMonth(e.target.value)} />
          )}
          {mode==='range' && (
            <React.Fragment>
              <input className="modal-input" type="date" style={{width:150}} value={rangeStart} onChange={e=>setRangeStart(e.target.value)} />
              <span style={{color:'var(--muted)',fontSize:13}}>até</span>
              <input className="modal-input" type="date" style={{width:150}} value={rangeEnd} onChange={e=>setRangeEnd(e.target.value)} />
            </React.Fragment>
          )}

          <button className="btn btn-ghost" onClick={()=>setPreview(buildReport())}>Pré-visualizar</button>
          <button className="btn btn-primary" onClick={downloadReport}>Baixar relatório (.txt)</button>
        </div>
        <div style={{fontSize:12.5,color:'var(--muted)',fontFamily:'var(--mono)'}}>
          Período selecionado: {periodLabel()}
        </div>
      </div>

      {preview && (
        <div className="panel" style={{padding:0}}>
          <div style={{padding:'12px 16px',borderBottom:'1px solid var(--line)',fontFamily:'var(--mono)',fontSize:11,textTransform:'uppercase',letterSpacing:'.05em',color:'var(--muted)'}}>
            Pré-visualização do arquivo .txt
          </div>
          <pre style={{
            margin:0,padding:16,whiteSpace:'pre-wrap',fontFamily:'var(--mono)',fontSize:12.5,
            lineHeight:1.6,maxHeight:480,overflowY:'auto',background:'#faf8f4'
          }}>{preview}</pre>
        </div>
      )}
    </React.Fragment>
  );
}
/* ---------------- Opportunity Modal (novo negocio) ---------------- */
function OpportunityModal({onClose, companies, contacts, stages, memberIds, onSave}){
  const [form, setForm] = useState({
    title:'', value:'', company_id:companies[0]?.id||'', contact_id:'',
    stage_id: stages.find(s=>!s.is_won && !s.is_lost)?.id || stages[0]?.id,
    owner_id: memberIds[0]||'', priority:'medium', next_action:''
  });
  function update(field,val){ setForm(prev=>({...prev,[field]:val})); }
  const companyContacts = contacts.filter(c=>c.company_id===form.company_id);

  function handleSave(){
    if(!form.title.trim() || !form.company_id) return;
    onSave(form);
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="drawer" onClick={e=>e.stopPropagation()} style={{width:400}}>
        <button className="drawer-close" onClick={onClose}>✕</button>
        <h2>Novo negócio</h2>
        <div style={{color:'var(--muted)',fontSize:13,marginBottom:18}}>Registre uma nova oportunidade de venda</div>

        <div className="field">
          <label>Título</label>
          <input className="modal-input" value={form.title} onChange={e=>update('title', e.target.value)} placeholder="Ex: Fornecimento anual" />
        </div>
        <div className="field">
          <label>Valor (R$)</label>
          <input className="modal-input" type="number" value={form.value} onChange={e=>update('value', e.target.value)} placeholder="0" />
        </div>
        <div className="field">
          <label>Empresa</label>
          <select className="modal-input" value={form.company_id} onChange={e=>{update('company_id', e.target.value); update('contact_id','');}}>
            {companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Contato</label>
          <select className="modal-input" value={form.contact_id} onChange={e=>update('contact_id', e.target.value)}>
            <option value="">Sem contato definido</option>
            {companyContacts.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Etapa inicial</label>
          <select className="modal-input" value={form.stage_id} onChange={e=>update('stage_id', e.target.value)}>
            {stages.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Responsável</label>
          <select className="modal-input" value={form.owner_id} onChange={e=>update('owner_id', e.target.value)}>
            {memberIds.map(id=><option key={id} value={id}>{userById(id)?.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Prioridade</label>
          <select className="modal-input" value={form.priority} onChange={e=>update('priority', e.target.value)}>
            <option value="high">Alta</option>
            <option value="medium">Média</option>
            <option value="low">Baixa</option>
          </select>
        </div>
        <div className="field">
          <label>Próxima ação (opcional)</label>
          <input className="modal-input" value={form.next_action} onChange={e=>update('next_action', e.target.value)} placeholder="Ex: Ligar amanhã" />
        </div>

        <button className="btn btn-primary" style={{marginTop:6}} onClick={handleSave}>Criar negócio</button>
      </div>
    </div>
  );
}

function DetailDrawer({drawer, onClose, tasks, activities, contacts, onToggleTask, canEdit, onAddNote}){
  const [note, setNote] = useState("");
  const relTasks = tasks.filter(t=>t.related_to_id===drawer.id);
  const relActivities = activities.filter(a=>a.related_to_id===drawer.id)
    .sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));

  let title, subtitle, fields;
  if(drawer.type==='opportunity'){
    const o = INITIAL_OPPS.concat().find(x=>x.id===drawer.id) || {};
    // pega versão mais atual via activities parent state not available here; use static fallback fields
    const company = companyById(o.company_id);
    const contact = contactById(o.contact_id, contacts);
    const owner = userById(o.owner_id);
    title = o.title;
    subtitle = company?.name;
    fields = [
      ['Valor', fmtBRL(o.value)],
      ['Contato', contact?.name || '—'],
      ['Dono', owner?.name],
      ['Status', o.status],
    ];
  } else {
    const c = companyById(drawer.id) || {};
    const owner = userById(c.owner_id);
    title = c.name;
    subtitle = c.segment;
    fields = [
      ['Porte', c.size],
      ['CNPJ', c.cnpj || '—'],
      ['Telefone geral', c.phone || '—'],
      ['E-mail geral', c.email || '—'],
      ['Dono', owner?.name],
    ];
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="drawer" onClick={e=>e.stopPropagation()}>
        <button className="drawer-close" onClick={onClose}>✕</button>
        <h2>{title}</h2>
        <div style={{color:'var(--muted)',fontSize:13,marginBottom:18}}>{subtitle}</div>

        {fields.map(([label,val])=>(
          <div className="field" key={label}>
            <label>{label}</label>
            <div className="field-value">{val}</div>
          </div>
        ))}

        <div className="field">
          <label>Tarefas relacionadas</label>
          {relTasks.length===0 && <div style={{fontSize:12.5,color:'var(--muted)'}}>Nenhuma tarefa vinculada.</div>}
          {relTasks.map(t=>(
            <div key={t.id} className={"task-row"+(t.status==='done'?' done':'')}>
              <div className={"checkbox"+(t.status==='done'?' checked':'')} onClick={()=>canEdit && onToggleTask(t.id)}>
                {t.status==='done'?'✓':''}
              </div>
              <div style={{flex:1,fontSize:13}}>{t.title}</div>
              <div style={{fontSize:11,color:'var(--muted)',fontFamily:'var(--mono)'}}>{fmtDate(t.due_date)}</div>
            </div>
          ))}
        </div>

        <div className="field">
          <label>Atividade (log imutável)</label>
          {relActivities.length===0 && <div style={{fontSize:12.5,color:'var(--muted)'}}>Sem atividades ainda.</div>}
          {relActivities.map(a=>(
            <div className="activity-item" key={a.id}>
              <span className="activity-type">{a.type}</span>
              <span className="activity-time">{new Date(a.created_at).toLocaleDateString('pt-BR')}</span>
              <div style={{fontSize:13,marginTop:3}}>{a.content}</div>
            </div>
          ))}
        </div>

        {canEdit && (
          <div className="field">
            <label>Adicionar nota</label>
            <textarea value={note} onChange={e=>setNote(e.target.value)}
              style={{width:'100%',minHeight:60,padding:8,border:'1px solid var(--line)',borderRadius:7,fontFamily:'var(--sans)',fontSize:13}} />
            <button className="btn btn-primary" style={{marginTop:8}}
              onClick={()=>{ if(note.trim()){ onAddNote(note.trim()); setNote(""); } }}>
              Registrar nota
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Bot de IA / WhatsApp Module (Evolution API + Firebase) ----------------
   Cada empresa (workspace) é um "tenant" isolado. O tenantId usado na Evolution API
   e no Firestore é o próprio workspaceId (ex: "ws_atlas"), então cada empresa conecta
   um número de WhatsApp diferente sem nenhum conflito entre elas. */
function BotModule({workspaceId, workspaceName, userId}){
  const api = window.FlowDeskAPI;
  const configured = !!(api && api.configured);

  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState(null);

  const [waStatus, setWaStatus] = useState(null);     // { state, qrcode, updatedAt }
  const [connecting, setConnecting] = useState(false);
  const [actionError, setActionError] = useState(null);

  const [contacts, setContacts] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  // 1) Autentica (login anônimo) e "carimba" o tenantId (empresa atual) no token,
  //    para as Firestore Rules liberarem só os dados dessa empresa.
  useEffect(()=>{
    if(!configured || !workspaceId) return;
    let cancelled = false;
    setSessionReady(false);
    setSessionError(null);
    api.ensureTenantSession(workspaceId)
      .then(()=>{ if(!cancelled) setSessionReady(true); })
      .catch(err=>{ if(!cancelled) setSessionError(String(err.message||err)); });
    return ()=>{ cancelled = true; };
  },[configured, workspaceId]);

  // 2) Escuta em tempo real o status da conexão do WhatsApp desta empresa
  useEffect(() => {
  if (!configured || !sessionReady || !workspaceId) return;
  const unsub = api.listenWhatsappStatus(workspaceId, (data) => setWaStatus(data));
  return () => unsub && unsub();
}, [configured, sessionReady, workspaceId]);

  // 3) Escuta contatos em tempo real (conversas recebidas via WhatsApp)
  useEffect(()=>{
    if(!configured || !sessionReady || !workspaceId) return;
    setContacts([]); setSelectedId(null);
    const unsub = api.listenContacts(workspaceId, (list)=> setContacts(list));
    return ()=> unsub && unsub();
  },[configured, sessionReady, workspaceId]);

  // 4) Escuta as mensagens do contato selecionado
  useEffect(()=>{
    if(!configured || !sessionReady || !workspaceId || !selectedId) { setMessages([]); return; }
    const unsub = api.listenMessages(workspaceId, selectedId, (list)=> setMessages(list));
    return ()=> unsub && unsub();
  },[configured, sessionReady, workspaceId, selectedId]);

  async function handleConnect(){
    setActionError(null);
    setConnecting(true);
    try{
      const res = await api.connectWhatsapp(workspaceId);
      setWaStatus(prev=>({...(prev||{}), state:'connecting', qrcode: res.qrcode || (prev&&prev.qrcode) || null}));
    }catch(err){
      setActionError(String(err.message||err));
    }finally{
      setConnecting(false);
    }
  }

  async function handleDisconnect(){
    setActionError(null);
    try{
      await api.disconnectWhatsapp(workspaceId);
      setWaStatus({state:'close', qrcode:null});
    }catch(err){
      setActionError(String(err.message||err));
    }
  }

  async function handleSend(){
    const text = input.trim();
    const contact = contacts.find(c=>c.id===selectedId);
    if(!text || !contact) return;
    setSending(true);
    setInput('');
    try{
      await api.sendMessage(workspaceId, contact.id, contact.phone, text);
    }catch(err){
      setActionError(String(err.message||err));
    }finally{
      setSending(false);
    }
  }

  function fmtTime(ts){
    try{
      const d = ts && ts.toDate ? ts.toDate() : (ts ? new Date(ts) : new Date());
      return d.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
    }catch(e){ return ''; }
  }

  const state = waStatus?.state || 'close';
  const isConnected = state === 'open';
  const isConnecting = state === 'connecting' || connecting;

  // cabeçalho comum (estilo FlowDesk) usado em todas as telas abaixo
  function FdHead(){
    return (
      <div className="fd-head">
        <div className="fd-head-title">
          <span className="fd-logo-mark">FD</span>
          Bot de IA — WhatsApp <span style={{color:'var(--text3)', fontWeight:500}}>· {workspaceName}</span>
        </div>
        <span className={"status-pill "+(isConnected?'active':isConnecting?'pending':'off')}>
          <span className="dot"></span>
          {isConnected ? 'Número conectado' : isConnecting ? 'Aguardando QR code' : 'Não configurado'}
        </span>
      </div>
    );
  }

  // ---------- Firebase ainda não configurado: mostra instruções em vez de quebrar ----------
  if(!configured){
    return (
      <div className="fd-scope" style={{flexDirection:'column'}}>
        <FdHead/>
        <div className="fd-connect-wrap">
          <div className="onboard-card fd-setup" style={{textAlign:'left'}}>
            <div className="onboard-card-title" style={{textAlign:'center'}}>Falta um passo para ativar de verdade</div>
            <div className="onboard-card-sub" style={{textAlign:'center'}}>
              O backend (Firebase + Evolution API) já está incluído neste projeto, mas o
              front-end ainda não tem as credenciais do seu projeto Firebase preenchidas.
            </div>
            <ol>
              <li>Abra <code>firebase-config.js</code> e preencha os dados do seu projeto Firebase.</li>
              <li>Rode <code>firebase deploy --only functions,firestore:rules</code> na pasta do projeto.</li>
              <li>Configure a Evolution API: <code>firebase functions:config:set evolution.url="..." evolution.apikey="..."</code></li>
              <li>Recarregue esta página — cada empresa poderá conectar seu próprio número.</li>
            </ol>
            <div className="onboard-card-sub" style={{marginBottom:0, textAlign:'center'}}>Veja o <code>README-INTEGRACAO.md</code> para o passo a passo completo.</div>
          </div>
        </div>
      </div>
    );
  }

  if(sessionError){
    return (
      <div className="fd-scope" style={{flexDirection:'column'}}>
        <FdHead/>
        <div className="fd-connect-wrap">
          <div className="onboard-card">
            <div className="onboard-card-title">Não foi possível conectar ao backend</div>
            <div className="fd-error">{sessionError}</div>
            <div className="onboard-card-sub" style={{marginBottom:0}}>
              Confira se o Firebase Functions foi implantado (<code>firebase deploy --only functions</code>) e
              se as credenciais em <code>firebase-config.js</code> estão corretas.
            </div>
          </div>
        </div>
      </div>
    );
  }

  if(!sessionReady){
    return (
      <div className="fd-scope" style={{flexDirection:'column'}}>
        <FdHead/>
        <div className="fd-connect-wrap"><div className="onboard-card-sub">Conectando ao backend…</div></div>
      </div>
    );
  }

  return (
    <div className="fd-scope" style={{flexDirection:'column'}}>
      <FdHead/>

      {!isConnected ? (
        <div className="fd-connect-wrap">
          <div className="onboard-card">
            {actionError && <div className="fd-error">{actionError}</div>}
            {isConnecting && waStatus?.qrcode ? (
              <>
                <div className="onboard-card-title">Escaneie o QR code</div>
                <div className="onboard-card-sub">
                  WhatsApp no celular de <strong>{workspaceName}</strong> → Aparelhos conectados → Conectar um aparelho.
                </div>
                <div className="fd-qr-box">
  <img
    src={
  waStatus.qrcode.startsWith("data:")
    ? waStatus.qrcode
    : `data:image/png;base64,${waStatus.qrcode}`
}
    alt="QR Code do WhatsApp"
  />
</div>
                <button className="btn primary" onClick={handleConnect} disabled={connecting}>Gerar novo QR code</button>
              </>
            ) : (
              <>
                <div className="onboard-card-title">Conectar WhatsApp</div>
                <div className="onboard-card-sub">
                  Cada empresa conecta o próprio número (via Evolution API). Conecte o número
                  comercial de <strong>{workspaceName}</strong> pra o bot atender de verdade.
                </div>
                <button className="btn primary" onClick={handleConnect} disabled={connecting}>
                  {connecting ? 'Gerando QR code…' : 'Conectar WhatsApp'}
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div style={{flex:1, display:'flex', overflow:'hidden'}}>
          <aside className="contact-list">
            <div className="list-header">
              <div className="list-title">
                <span>Conversas</span>
                <button className="btn danger sm" onClick={handleDisconnect} title="Desconectar este número">Desconectar</button>
              </div>
            </div>
            <div className="contacts-scroll">
              {actionError && <div className="fd-error">{actionError}</div>}
              {contacts.length===0 && <div className="fd-empty">Nenhuma conversa ainda. Assim que alguém escrever para o número conectado, aparece aqui.</div>}
              {contacts.map(c=>(
                <div key={c.id} className={"contact-card"+(selectedId===c.id?" active":"")} onClick={()=>setSelectedId(c.id)}>
                  <div className="contact-avatar">
                    {(c.name||c.phone||'?').slice(0,2).toUpperCase()}
                    <span className="channel-dot"></span>
                  </div>
                  <div className="contact-info">
                    <div className="contact-name">
                      {c.name || c.phone}
                      {c.unread>0 && <span className="contact-badge">{c.unread}</span>}
                    </div>
                    <div className="contact-preview">{c.preview || ''}</div>
                  </div>
                </div>
              ))}
            </div>
          </aside>

          <main className="chat-area">
            {!selectedId ? (
              <div className="fd-empty" style={{margin:'auto', textAlign:'center'}}>Selecione uma conversa para visualizar as mensagens.</div>
            ) : (
              <>
                <div className="chat-header">
                  <div className="contact-avatar-lg">{(contacts.find(c=>c.id===selectedId)?.name||'?').slice(0,2).toUpperCase()}</div>
                  <div>
                    <div className="chat-contact-name">{contacts.find(c=>c.id===selectedId)?.name || contacts.find(c=>c.id===selectedId)?.phone}</div>
                    <div className="chat-contact-sub">
                      <span className="channel-label">WhatsApp</span>
                      <span className="dot-sep">·</span>
                      <span>{contacts.find(c=>c.id===selectedId)?.phone}</span>
                    </div>
                  </div>
                </div>
                <div className="messages-container">
                  {messages.map((m,i)=>(
                    <div key={m.id||i} className={"msg-wrap"+(m.from==='agent'?' out':'')}>
                      <div className="msg-avatar-sm">{m.from==='agent' ? (userId||'').slice(0,2).toUpperCase() : (contacts.find(c=>c.id===selectedId)?.name||'?').slice(0,2).toUpperCase()}</div>
                      <div>
                        <div className="msg-bubble">{m.text}</div>
                        <div className="msg-time">{fmtTime(m.timestamp)}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="input-area">
                  <div className="input-row">
                    <textarea
                      className="msg-input"
                      rows={1}
                      value={input}
                      onChange={e=>setInput(e.target.value)}
                      onKeyDown={e=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); handleSend(); } }}
                      placeholder="Digite uma mensagem para enviar pelo WhatsApp…"
                    />
                    <button className="send-btn" onClick={handleSend} disabled={!input.trim()||sending} title="Enviar">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                    </button>
                  </div>
                </div>
              </>
            )}
          </main>
        </div>
      )}
    </div>
  );
}

/* ---------------- Landing Page Module ---------------- */
function LandingModule({url}){
  const [currentUrl, setCurrentUrl] = useState(url || 'https://example.com');
  return (
    <div className="landing-wrap">
      <div className="landing-bar">
        <div className="landing-url">{currentUrl}</div>
        <button className="btn btn-ghost" onClick={()=>document.getElementById('landing-iframe').src+=''}>Recarregar</button>
        <a className="btn btn-primary" href={currentUrl} target="_blank" rel="noopener noreferrer">Abrir em nova aba</a>
      </div>
      <iframe id="landing-iframe" className="landing-frame" src={currentUrl} title="Site do cliente" />
    </div>
  );
}

/* =========================================================================
   LOGIN — separação por empresa (multi-tenant)
   ========================================================================= */
function LoginScreen({onLogin}){
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  // login único: não existe mais tela de "escolha sua empresa" com lista de
  // botões (não escalaria com muitas empresas). O workspace é resolvido
  // automaticamente a partir da conta encontrada pelo e-mail — cada conta já
  // sabe a qual empresa pertence (o domínio depois do "@" é só uma convenção
  // de organização dos e-mails, quem decide o workspace é o cadastro da conta).
  function tryLogin(e){
    e.preventDefault();
    setError('');
    const account = LOGIN_ACCOUNTS.find(a=>
      a.email.toLowerCase()===email.trim().toLowerCase() && a.password===password
    );
    if(!account){
      setError('E-mail ou senha inválidos.');
      return;
    }
    if(account.is_master){
      onLogin({user_id:account.user_id, workspace_id:null, is_master:true});
      return;
    }
    onLogin({user_id:account.user_id, workspace_id:account.workspace_id, is_master:false});
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <div className="mark">N</div>
          <div className="brand-name">Nexo CRM</div>
        </div>

        <h1 className="login-title">Entrar</h1>
        <p className="login-sub">Use o e-mail e senha da sua empresa. O workspace certo é aberto automaticamente.</p>
        <form onSubmit={tryLogin} className="login-form">
          <div className="field">
            <label>E-mail</label>
            <input className="modal-input" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="voce@suaempresa.com" required autoFocus />
          </div>
          <div className="field">
            <label>Senha</label>
            <input className="modal-input" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" required />
          </div>
          {error && <div className="login-error">{error}</div>}
          <button type="submit" className="btn btn-primary" style={{width:'100%',marginTop:6}}>Entrar</button>
        </form>
      </div>
    </div>
  );
}

/* ---------------- Controle de sessão ---------------- */
function AuthGate(){
  const [auth, setAuth] = useState(null);
  if(!auth){
    return <LoginScreen onLogin={setAuth} />;
  }
  return <Workspace auth={auth} onLogout={()=>setAuth(null)} />;
}

ReactDOM.createRoot(document.getElementById('root')).render(<AuthGate />);

