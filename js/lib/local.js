/**
 * Trump Offers — Local Preview adapter.
 *
 * This adapter exists so the complete product can be reviewed before a
 * Supabase project is connected. It mirrors the SQL schema, RPC signatures and
 * state transitions used by the production adapter, and persists to
 * localStorage. It is never used when Supabase is configured.
 */

import config from '../config.js';

const KEY = config.demoKey;
const SESSION = config.sessionKey;

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
const daysAhead = (n) => new Date(Date.now() + n * 86400000).toISOString();
const hoursAhead = (n) => new Date(Date.now() + n * 3600000).toISOString();

const DEMO_ID = '8a7b6c54-1d2e-4f90-a3b1-52c8d7e44001';
const ADMIN_ID = '3f1e2d9a-7c4b-4a12-9e88-61b0c5d33002';

const JOBS = [
  {
    id: 'b1a2c3d4-0001-4e5f-8a90-000000000001',
    slug: 'private-client-advisor',
    title: 'Private Client Advisor',
    department: 'Client Services',
    employment_type: 'Full-time',
    work_mode: 'Hybrid',
    location: 'New York, NY',
    salary_min: 118000,
    salary_max: 145000,
    currency: 'USD',
    summary:
      'Guide members through their rewards journey with discretion, clarity and an unusual level of care.',
    description:
      'Trump Offers is building a new kind of rewards and opportunity platform. As a Private Client Advisor, you will be the considered voice members meet at every important moment — from their first reward claim to their first introduction to a hiring partner.\n\nThis is a relationship role in the truest sense. You will work across a small portfolio of members, anticipate needs before they are articulated, and turn complexity into calm. You will partner closely with Operations, Product and Recruitment to make sure every promise the platform makes is kept.',
    responsibilities: [
      'Own a portfolio of member relationships across rewards, cards and career introductions.',
      'Guide members through membership workflows with clear, jargon-free communication.',
      'Translate recurring member feedback into concise product and operations briefs.',
      'Partner with recruitment teams to coordinate warm candidate introductions.',
      'Maintain meticulous records and uphold the platform’s privacy standards.',
    ],
    requirements: [
      '4+ years in private banking, premium hospitality, client services or a related field.',
      'Exceptional written communication and a naturally discreet manner.',
      'Comfort working with modern productivity and CRM tools.',
      'A calm, structured approach to competing priorities.',
      'Authorization to work in the United States.',
    ],
    benefits: [
      'Competitive base salary and performance award',
      'Comprehensive health and wellbeing cover',
      'Hybrid schedule with a beautiful Manhattan studio',
      'Annual learning and travel allowance',
    ],
    deadline: daysAhead(38).slice(0, 10),
    status: 'open',
    featured: true,
    created_at: daysAgo(6),
  },
  {
    id: 'b1a2c3d4-0002-4e5f-8a90-000000000002',
    slug: 'product-designer-digital-card',
    title: 'Product Designer, Digital Card',
    department: 'Product Design',
    employment_type: 'Full-time',
    work_mode: 'Remote',
    location: 'London, United Kingdom',
    salary_min: 96000,
    salary_max: 124000,
    currency: 'USD',
    summary:
      'Shape the most tactile, considered digital card experience in the rewards category.',
    description:
      'We are looking for a product designer with a sharp editorial eye and a respect for the quiet details that make a product feel distinguished. You will own the end-to-end design of the Trump digital card: application, presentation, verification and administration.\n\nYou will work directly with engineering and brand, moving from wide explorations to production-ready specifications without losing the idea. We care deeply about craft, but we care more about clarity.',
    responsibilities: [
      'Design end-to-end flows for the digital card, from application to verification.',
      'Build and maintain a small, rigorous design system for the card surfaces.',
      'Prototype interactions and test them with members and internal teams.',
      'Pair with engineers to protect quality through implementation.',
      'Present work clearly to senior stakeholders.',
    ],
    requirements: [
      'A portfolio demonstrating strong visual and interaction design.',
      '3+ years designing consumer or fintech products.',
      'Fluency in Figma, prototyping and design-system practice.',
      'A thoughtful approach to accessibility and responsive behaviour.',
      'Excellent written communication in English.',
    ],
    benefits: [
      'Remote-first with quarterly team gatherings',
      'Home-office and equipment budget',
      'Private health cover and pension contribution',
      'Four-day summer weeks',
    ],
    deadline: daysAhead(24).slice(0, 10),
    status: 'open',
    featured: true,
    created_at: daysAgo(3),
  },
  {
    id: 'b1a2c3d4-0003-4e5f-8a90-000000000003',
    slug: 'rewards-operations-associate',
    title: 'Rewards Operations Associate',
    department: 'Operations',
    employment_type: 'Full-time',
    work_mode: 'On-site',
    location: 'New York, NY',
    salary_min: 64000,
    salary_max: 78000,
    currency: 'USD',
    summary:
      'Keep every claim, withdrawal and card application moving with precision.',
    description:
      'The Rewards Operations Associate sits at the centre of the platform. You will review member records, maintain service levels, and make sure members always know exactly where things stand.\n\nYou will be joining a small operations team with a broad mandate. Expect to improve processes as often as you run them, and to work closely with the administrators who oversee the platform.',
    responsibilities: [
      'Review and progress reward claims and withdrawal requests.',
      'Maintain claim records, reference numbers and status accuracy.',
      'Escalate anomalies and document resolutions clearly.',
      'Support member enquiries with accurate, kind responses.',
      'Contribute to operational playbooks and service-level reporting.',
    ],
    requirements: [
      '1–3 years in operations, financial services or customer support.',
      'Meticulous attention to detail and strong numeracy.',
      'Comfort with spreadsheets and operations dashboards.',
      'Clear written communication and a steady temperament.',
      'New York based or willing to relocate.',
    ],
    benefits: [
      'Performance-linked annual award',
      'Medical, dental and vision cover',
      'Commuter and wellness allowances',
      'Structured development pathway',
    ],
    deadline: daysAhead(31).slice(0, 10),
    status: 'open',
    featured: true,
    created_at: daysAgo(8),
  },
  {
    id: 'b1a2c3d4-0004-4e5f-8a90-000000000004',
    slug: 'recruitment-partner',
    title: 'Recruitment Partner',
    department: 'People & Culture',
    employment_type: 'Full-time',
    work_mode: 'Remote',
    location: 'United States',
    salary_min: 82000,
    salary_max: 98000,
    currency: 'USD',
    summary:
      'Connect exceptional people with the teams building a more considered rewards platform.',
    description:
      'As Recruitment Partner you will own hiring across product, operations and client services. You will design calm, respectful processes and represent Trump Offers with the same care our members experience.\n\nThis role suits someone who believes recruitment is a craft: part listening, part storytelling and part operating discipline.',
    responsibilities: [
      'Own full-cycle hiring for product, operations and client teams.',
      'Partner with hiring managers on role design and interview structure.',
      'Build thoughtful candidate communications and feedback loops.',
      'Maintain accurate applicant records and reporting.',
      'Champion an equitable, accessible hiring experience.',
    ],
    requirements: [
      '3+ years of in-house or agency recruitment experience.',
      'Evidence of hiring for both technical and operational roles.',
      'Strong interviewing and stakeholder-management skills.',
      'Comfort with applicant tracking systems and data hygiene.',
      'Based in the United States.',
    ],
    benefits: [
      'Remote-first with a connected team culture',
      'Annual learning stipend',
      'Health and wellbeing cover',
      'Generous paid leave',
    ],
    deadline: daysAhead(45).slice(0, 10),
    status: 'open',
    featured: false,
    created_at: daysAgo(11),
  },
  {
    id: 'b1a2c3d4-0005-4e5f-8a90-000000000005',
    slug: 'brand-content-strategist',
    title: 'Brand & Content Strategist',
    department: 'Marketing',
    employment_type: 'Contract',
    work_mode: 'Hybrid',
    location: 'London, United Kingdom',
    salary_min: 70000,
    salary_max: 90000,
    currency: 'USD',
    summary:
      'Write the words that make our private membership platform feel considered, prestigious and human.',
    description:
      'We are looking for a brand writer and content strategist for a twelve-month contract. You will shape the voice of Trump Offers across product, web and member communications.\n\nThe ideal candidate has a portfolio of editorial or premium brand work, a dislike of filler, and the discipline to make every sentence earn its place.',
    responsibilities: [
      'Define and maintain the Trump Offers tone of voice.',
      'Write product copy, member communications and editorial features.',
      'Partner with design on campaign concepts and art direction.',
      'Review copy across the platform for clarity and consistency.',
      'Build a lightweight content style guide.',
    ],
    requirements: [
      'A portfolio of premium brand, editorial or product writing.',
      '5+ years in copywriting or content strategy.',
      'Exceptional editing instincts and attention to detail.',
      'Comfort working across time zones.',
      'Available for a twelve-month contract.',
    ],
    benefits: [
      'Day rate commensurate with experience',
      'Hybrid studio access in London',
      'Quarterly team gatherings',
      'A genuinely calm working culture',
    ],
    deadline: daysAhead(19).slice(0, 10),
    status: 'open',
    featured: false,
    created_at: daysAgo(2),
  },
  {
    id: 'b1a2c3d4-0006-4e5f-8a90-000000000006',
    slug: 'risk-compliance-analyst',
    title: 'Risk & Compliance Analyst',
    department: 'Risk',
    employment_type: 'Full-time',
    work_mode: 'On-site',
    location: 'Singapore',
    salary_min: 88000,
    salary_max: 106000,
    currency: 'USD',
    summary:
      'Design the controls that keep a simulated rewards environment safe, honest and well-governed.',
    description:
      'You will help define the standards that govern a demonstration rewards platform: data minimisation, clear disclosures, secure access and reliable audit trails.\n\nThis is a hands-on role for someone who enjoys turning principles into practical controls and can explain them to non-specialists.',
    responsibilities: [
      'Maintain the platform risk register and control documentation.',
      'Review data handling and access practices against policy.',
      'Support incident response and audit preparation.',
      'Advise product teams on disclosure and consumer-protection requirements.',
      'Produce clear monthly risk reporting for leadership.',
    ],
    requirements: [
      '3+ years in risk, compliance or audit within financial services.',
      'Working knowledge of data-protection frameworks.',
      'Strong analytical writing and documentation skills.',
      'Ability to influence without authority.',
      'Based in Singapore or willing to relocate.',
    ],
    benefits: [
      'Competitive salary and annual award',
      'Comprehensive medical cover',
      'Professional certification support',
      'Central Singapore office',
    ],
    deadline: daysAhead(52).slice(0, 10),
    status: 'open',
    featured: false,
    created_at: daysAgo(9),
  },
];

const SETTINGS = {
  site_name: 'Trump Offers',
  tagline: 'Opportunities. Rewards. Possibilities.',
  hero_headline: 'Opportunities. Rewards. Possibilities.',
  hero_support:
    'Explore opportunities, discover career possibilities and experience a modern demonstration rewards platform designed around simplicity and accessibility.',
  support_email: 'concierge@trumpoffers.com',
  support_phone: '+1 (212) 555-0184',
  address: 'One Trump Place, Suite 1200, New York, NY 10004',
  office_hours: 'Monday–Friday, 9:00–18:00 ET',
  intro_video_url: 'assets/videos/trump-intro.mp4',
  intro_video_enabled: true,
  intro_autoplay: false,
  announcement: '',
  linkedin_url: 'https://www.linkedin.com/',
  instagram_url: 'https://www.instagram.com/',
  updated_at: daysAgo(1),
};

function seed() {
  const users = [
    {
      id: DEMO_ID,
      email: config.demoUser,
      password: config.demoPassword,
      full_name: 'Amara Bennett',
      phone: '+1 (917) 555-0142',
      location: 'New York, NY',
      role: 'user',
      status: 'active',
      created_at: daysAgo(126),
    },
    {
      id: ADMIN_ID,
      email: config.demoAdmin,
      password: config.demoPassword,
      full_name: 'Marcus Hale',
      phone: '+1 (212) 555-0191',
      location: 'New York, NY',
      role: 'admin',
      status: 'active',
      created_at: daysAgo(240),
    },
  ];

  const reward_accounts = [
    {
      id: 'c1a2b3c4-0001-4e5f-8a90-000000000001',
      user_id: DEMO_ID,
      balance: 30000,
      currency: 'USD',
      is_simulated: true,
      status: 'active',
      created_at: daysAgo(126),
    },
  ];

  const claims = [
    {
      id: 'd1a2b3c4-0001-4e5f-8a90-000000000001',
      user_id: DEMO_ID,
      reference: 'TO-RW-26-000184',
      amount: 30000,
      status: 'completed',
      stage: 4,
      progress: 100,
      note: 'Demonstration reward confirmed and closed.',
      created_at: daysAgo(46),
      processing_started_at: daysAgo(46),
      estimated_completion_at: daysAgo(46),
      completed_at: daysAgo(45),
    },
  ];

  const withdrawals = [
    {
      id: 'e1a2b3c4-0001-4e5f-8a90-000000000001',
      user_id: DEMO_ID,
      reference: 'TO-WD-26-000067',
      amount: 2500,
      method: 'bank_transfer',
      destination_label: 'Bank •••• 4821',
      account_name: 'Amara Bennett',
      status: 'paid',
      note: 'Demonstration withdrawal completed.',
      created_at: daysAgo(21),
      estimated_completion_at: daysAgo(19),
      processed_at: daysAgo(19),
    },
  ];

  const applications = [
    {
      id: 'f1a2b3c4-0001-4e5f-8a90-000000000001',
      vacancy_id: JOBS[1].id,
      user_id: DEMO_ID,
      reference: 'TO-JB-26-000412',
      full_name: 'Amara Bennett',
      email: config.demoUser,
      phone: '+1 (917) 555-0142',
      location: 'New York, NY',
      qualifications: 'BA Communication Design, Parsons School of Design',
      experience:
        'Six years designing premium consumer products across fintech and hospitality, with a focus on card and payment experiences.',
      resume_name: 'Amara-Bennett-CV.pdf',
      resume_mime: 'application/pdf',
      resume_size: 284000,
      status: 'under_review',
      review_notes: '',
      created_at: daysAgo(2),
    },
  ];

  const card_applications = [
    {
      id: 'a1a2b3c4-0001-4e5f-8a90-000000000001',
      user_id: DEMO_ID,
      reference: 'TO-CD-26-000233',
      design: 'noir',
      cardholder_name: 'AMARA BENNETT',
      fictional_card_number: '4539821044718064',
      expiry_month: 11,
      expiry_year: 2029,
      status: 'approved',
      note: 'Demonstration card approved.',
      created_at: daysAgo(32),
      updated_at: daysAgo(31),
    },
  ];

  const notifications = [
    {
      id: 'b1b2c3d4-0001-4e5f-8a90-000000000001',
      user_id: DEMO_ID,
      title: 'Your demonstration card is approved',
      body: 'Your Trump Noir card application TO-CD-26-000233 has been approved. View your fictional card details in the card studio.',
      type: 'card',
      read_at: daysAgo(30),
      created_at: daysAgo(31),
    },
    {
      id: 'b1b2c3d4-0002-4e5f-8a90-000000000002',
      user_id: DEMO_ID,
      title: 'Demonstration claim completed',
      body: 'Reward claim TO-RW-26-000184 has been closed in the demonstration environment. No funds were transferred.',
      type: 'reward',
      read_at: daysAgo(44),
      created_at: daysAgo(45),
    },
    {
      id: 'b1b2c3d4-0003-4e5f-8a90-000000000003',
      user_id: DEMO_ID,
      title: 'Welcome to Trump Offers',
      body: 'Your demonstration account is ready. Explore rewards, open roles and the virtual card studio at your own pace.',
      type: 'account',
      read_at: null,
      created_at: daysAgo(126),
    },
  ];

  const activity = [
    {
      id: 'c1b2c3d4-0001-4e5f-8a90-000000000001',
      user_id: DEMO_ID,
      action: 'application.submitted',
      entity_type: 'job_application',
      description: 'Application submitted for Product Designer, Digital Card.',
      created_at: daysAgo(2),
    },
    {
      id: 'c1b2c3d4-0002-4e5f-8a90-000000000002',
      user_id: DEMO_ID,
      action: 'withdrawal.paid',
      entity_type: 'withdrawal',
      description: 'Demonstration withdrawal TO-WD-26-000067 marked complete.',
      created_at: daysAgo(19),
    },
    {
      id: 'c1b2c3d4-0003-4e5f-8a90-000000000003',
      user_id: DEMO_ID,
      action: 'card.approved',
      entity_type: 'card_application',
      description: 'Demonstration card application TO-CD-26-000233 approved.',
      created_at: daysAgo(31),
    },
    {
      id: 'c1b2c3d4-0004-4e5f-8a90-000000000004',
      user_id: DEMO_ID,
      action: 'claim.completed',
      entity_type: 'reward_claim',
      description: 'Demonstration reward claim TO-RW-26-000184 completed.',
      created_at: daysAgo(45),
    },
    {
      id: 'c1b2c3d4-0005-4e5f-8a90-000000000005',
      user_id: DEMO_ID,
      action: 'account.created',
      entity_type: 'profile',
      description: 'Trump Offers demonstration account created.',
      created_at: daysAgo(126),
    },
  ];

  const messages = [
    {
      id: 'd1b2c3d4-0001-4e5f-8a90-000000000001',
      name: 'Daniel Okafor',
      email: 'daniel.okafor@example.com',
      phone: '+1 (646) 555-0110',
      subject: 'Question about the demonstration card',
      message:
        'Hello — I would like to understand whether the card details generated in the card studio are functional. I want to be certain before I share the platform with a colleague.',
      status: 'new',
      created_at: daysAgo(1),
    },
    {
      id: 'd1b2c3d4-0002-4e5f-8a90-000000000002',
      name: 'Elena Marsh',
      email: 'elena.marsh@example.com',
      phone: '+44 20 7946 0821',
      subject: 'Recruitment process timing',
      message:
        'I submitted an application for the Brand & Content Strategist role last week. Could you confirm the typical review window? Thank you.',
      status: 'read',
      created_at: daysAgo(5),
    },
  ];

  return {
    version: 2,
    users,
    reward_accounts,
    claims,
    withdrawals,
    applications,
    card_applications,
    notifications,
    activity,
    messages,
    jobs: JOBS,
    settings: SETTINGS,
    refs: { 'TO-RW': 184, 'TO-WD': 67, 'TO-JB': 412, 'TO-CD': 233 },
    seeded_at: new Date().toISOString(),
  };
}

async function hash(value) {
  try {
    const data = new TextEncoder().encode(String(value));
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return btoa(unescape(encodeURIComponent(String(value))));
  }
}

function readSession() {
  try {
    const raw = localStorage.getItem(SESSION);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSession(userId) {
  if (userId) localStorage.setItem(SESSION, JSON.stringify({ userId, createdAt: new Date().toISOString() }));
  else localStorage.removeItem(SESSION);
}

function nextRef(db, prefix) {
  db.refs[prefix] = (db.refs[prefix] || 0) + 1;
  const year = String(new Date().getFullYear()).slice(-2);
  return `${prefix}-${year}-${String(db.refs[prefix]).padStart(6, '0')}`;
}

function luhnNumber(prefix = '4539') {
  let body = prefix;
  while (body.length < 15) body += Math.floor(Math.random() * 10);
  let sum = 0;
  for (let i = 0; i < body.length; i += 1) {
    let digit = Number(body[body.length - 1 - i]);
    if (i % 2 === 0) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return body + ((10 - (sum % 10)) % 10);
}

class LocalBackend {
  constructor() {
    this.mode = 'demo';
    this._ready = null;
  }

  async init() {
    if (this._ready) return this._ready;
    this._ready = (async () => {
      let db;
      try {
        db = JSON.parse(localStorage.getItem(KEY) || 'null');
      } catch {
        db = null;
      }
      if (!db || db.version !== 2) {
        db = seed();
        for (const user of db.users) user.password = await hash(user.password);
        localStorage.setItem(KEY, JSON.stringify(db));
      }
      return db;
    })();
    return this._ready;
  }

  async db() {
    await this.init();
    return JSON.parse(localStorage.getItem(KEY));
  }

  async save(db) {
    localStorage.setItem(KEY, JSON.stringify(db));
    return db;
  }

  userProfile(db, user) {
    if (!user) return null;
    const { password, ...rest } = user;
    return {
      ...rest,
      role: user.role || 'user',
      avatar_url: null,
    };
  }

  async currentUser(db) {
    const session = readSession();
    if (!session) return null;
    const user = db.users.find((u) => u.id === session.userId);
    if (!user || user.status !== 'active') return null;
    return user;
  }

  requireUser(db) {
    return this.currentUser(db).then((user) => {
      if (!user) throw new Error('Your session has ended. Please sign in again.');
      return user;
    });
  }

  requireAdmin(db) {
    return this.requireUser(db).then((user) => {
      if (user.role !== 'admin') throw new Error('Administrator access is required.');
      return user;
    });
  }

  logActivity(db, userId, action, entityType, description) {
    db.activity.unshift({
      id: crypto.randomUUID ? crypto.randomUUID() : `act-${Date.now()}`,
      user_id: userId || null,
      action,
      entity_type: entityType,
      description,
      created_at: new Date().toISOString(),
    });
  }

  notify(db, userId, title, body, type = 'system') {
    db.notifications.unshift({
      id: crypto.randomUUID ? crypto.randomUUID() : `ntf-${Date.now()}`,
      user_id: userId,
      title,
      body,
      type,
      read_at: null,
      created_at: new Date().toISOString(),
    });
  }

  /* ------------------------------------------------------------------ auth */

  auth = {
    getSession: async () => {
      const db = await this.db();
      const user = await this.currentUser(db);
      return user ? { user: this.userProfile(db, user), profile: this.userProfile(db, user) } : null;
    },
    signIn: async ({ email, password }) => {
      const db = await this.db();
      const user = db.users.find((u) => u.email.toLowerCase() === String(email).trim().toLowerCase());
      if (!user) throw new Error('We could not find an account with that email address.');
      const digest = await hash(password);
      if (digest !== user.password) throw new Error('The password entered is incorrect.');
      if (user.status !== 'active') throw new Error('This account is suspended. Contact the platform administrator.');
      writeSession(user.id);
      this.logActivity(db, user.id, 'auth.signin', 'session', 'Member signed in.');
      await this.save(db);
      const profile = this.userProfile(db, user);
      return { user: profile, profile };
    },
    signUp: async ({ fullName, email, password, phone, location }) => {
      const db = await this.db();
      const normalized = String(email).trim().toLowerCase();
      if (db.users.some((u) => u.email.toLowerCase() === normalized)) {
        throw new Error('An account already exists with this email address.');
      }
      if (String(password).length < 8) throw new Error('Use a password with at least 8 characters.');
      const user = {
        id: crypto.randomUUID ? crypto.randomUUID() : `usr-${Date.now()}`,
        email: normalized,
        password: await hash(password),
        full_name: String(fullName).trim(),
        phone: String(phone || '').trim(),
        location: String(location || '').trim(),
        role: 'user',
        status: 'active',
        created_at: new Date().toISOString(),
      };
      db.users.push(user);
      db.reward_accounts.push({
        id: crypto.randomUUID(),
        user_id: user.id,
        balance: config.simulationBalance,
        currency: 'USD',
        is_simulated: true,
        status: 'active',
        created_at: new Date().toISOString(),
      });
      this.notify(db, user.id, 'Welcome to Trump Offers', 'Your demonstration account is ready. Explore rewards, open roles and the card studio at your own pace.', 'account');
      this.logActivity(db, user.id, 'account.created', 'profile', 'Trump Offers demonstration account created.');
      await this.save(db);
      writeSession(user.id);
      const profile = this.userProfile(db, user);
      return { user: profile, profile, session: true };
    },
    signOut: async () => {
      const db = await this.db();
      const user = await this.currentUser(db);
      if (user) {
        this.logActivity(db, user.id, 'auth.signout', 'session', 'Member signed out.');
        await this.save(db);
      }
      writeSession(null);
      return true;
    },
    resetPassword: async ({ email }) => {
      const db = await this.db();
      const user = db.users.find((u) => u.email.toLowerCase() === String(email).trim().toLowerCase());
      if (!user) throw new Error('We could not find an account with that email address.');
      return { message: 'If that email is registered, a demonstration reset link has been prepared.' };
    },
    updatePassword: async (password) => {
      const db = await this.db();
      const user = await this.requireUser(db);
      if (String(password).length < 8) throw new Error('Use a password with at least 8 characters.');
      user.password = await hash(password);
      this.logActivity(db, user.id, 'auth.password', 'session', 'Account password updated.');
      await this.save(db);
      return true;
    },
    updateProfile: async (patch) => {
      const db = await this.db();
      const user = await this.requireUser(db);
      user.full_name = patch.full_name ?? user.full_name;
      user.phone = patch.phone ?? user.phone;
      user.location = patch.location ?? user.location;
      this.logActivity(db, user.id, 'profile.updated', 'profile', 'Account details updated.');
      await this.save(db);
      return this.userProfile(db, user);
    },
    listUsers: async (search = '') => {
      const db = await this.db();
      await this.requireAdmin(db);
      const q = search.toLowerCase();
      return db.users
        .filter((u) => !q || u.email.toLowerCase().includes(q) || u.full_name.toLowerCase().includes(q))
        .map((u) => this.userProfile(db, u))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    },
    setUserStatus: async (userId, status) => {
      const db = await this.db();
      await this.requireAdmin(db);
      const user = db.users.find((u) => u.id === userId);
      if (!user) throw new Error('Member not found.');
      user.status = status;
      this.notify(db, userId, status === 'active' ? 'Account reinstated' : 'Account suspended', status === 'active' ? 'Your demonstration account access has been reinstated.' : 'Your demonstration account has been suspended. Contact the administrator for assistance.', 'account');
      this.logActivity(db, userId, 'user.status', 'profile', `Account status set to ${status}.`);
      await this.save(db);
      return this.userProfile(db, user);
    },
  };

  /* --------------------------------------------------------------- rewards */

  async getRewardAccount() {
    const db = await this.db();
    const user = await this.requireUser(db);
    const account = db.reward_accounts.find((a) => a.user_id === user.id);
    if (!account) throw new Error('Your reward account is not available.');
    const activeWithdrawals = db.withdrawals
      .filter((w) => w.user_id === user.id && ['pending', 'reviewing', 'processing'].includes(w.status))
      .reduce((sum, w) => sum + Number(w.amount), 0);
    return {
      ...account,
      available_balance: Math.max(0, Number(account.balance) - activeWithdrawals),
      simulated: true,
    };
  }

  async getClaims() {
    const db = await this.db();
    const user = await this.requireUser(db);
    return db.claims
      .filter((c) => c.user_id === user.id)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  async getActiveClaim() {
    const claims = await this.getClaims();
    return claims.find((c) => ['confirmed', 'verifying', 'processing'].includes(c.status)) || null;
  }

  async createClaim() {
    const db = await this.db();
    const user = await this.requireUser(db);
    const active = db.claims.find(
      (c) => c.user_id === user.id && ['confirmed', 'verifying', 'processing'].includes(c.status)
    );
    if (active) throw new Error('You already have a reward claim in progress.');
    const hours = Math.floor(Math.random() * (config.claimMaxHours - config.claimMinHours + 1)) + config.claimMinHours;
    const claim = {
      id: crypto.randomUUID ? crypto.randomUUID() : `clm-${Date.now()}`,
      user_id: user.id,
      reference: nextRef(db, 'TO-RW'),
      amount: config.simulationBalance,
      status: 'verifying',
      stage: 2,
      progress: 22,
      note: 'Demonstration verification in progress. No real funds are involved.',
      created_at: new Date().toISOString(),
      processing_started_at: new Date().toISOString(),
      estimated_completion_at: hoursAhead(hours),
      completed_at: null,
    };
    db.claims.unshift(claim);
    this.notify(db, user.id, 'Reward claim received', `Claim ${claim.reference} is being verified in the demonstration environment. Estimated processing window: ${hours} hours.`, 'reward');
    this.logActivity(db, user.id, 'claim.created', 'reward_claim', `Demonstration reward claim ${claim.reference} submitted.`);
    await this.save(db);
    return claim;
  }

  async getWithdrawals() {
    const db = await this.db();
    const user = await this.requireUser(db);
    return db.withdrawals
      .filter((w) => w.user_id === user.id)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  async createWithdrawal({ amount, method, destinationLabel, accountName }) {
    const db = await this.db();
    const user = await this.requireUser(db);
    const numeric = Number(amount);
    if (!Number.isFinite(numeric) || numeric < config.withdrawMin) {
      throw new Error(`The minimum demonstration withdrawal is ${config.withdrawMin}.`);
    }
    const account = db.reward_accounts.find((a) => a.user_id === user.id);
    const active = db.withdrawals
      .filter((w) => w.user_id === user.id && ['pending', 'reviewing', 'processing'].includes(w.status))
      .reduce((sum, w) => sum + Number(w.amount), 0);
    const available = Number(account.balance) - active;
    if (numeric > available) throw new Error('That amount exceeds your available demonstration balance.');
    if (!['bank_transfer', 'digital_wallet', 'card_credit'].includes(method)) {
      throw new Error('Select a demonstration withdrawal method.');
    }
    if (/\d{8,}/.test(String(destinationLabel))) {
      throw new Error('Please use a masked destination and never enter full banking details.');
    }
    const withdrawal = {
      id: crypto.randomUUID ? crypto.randomUUID() : `wdr-${Date.now()}`,
      user_id: user.id,
      reference: nextRef(db, 'TO-WD'),
      amount: numeric,
      method,
      destination_label: String(destinationLabel || '').trim(),
      account_name: String(accountName || user.full_name).trim(),
      status: 'processing',
      note: 'Simulated withdrawal submitted for demonstration processing.',
      created_at: new Date().toISOString(),
      estimated_completion_at: daysAhead(3),
      processed_at: null,
    };
    db.withdrawals.unshift(withdrawal);
    this.notify(db, user.id, 'Withdrawal submitted', `Demonstration withdrawal ${withdrawal.reference} is processing. No real transfer will occur.`, 'withdrawal');
    this.logActivity(db, user.id, 'withdrawal.created', 'withdrawal', `Demonstration withdrawal ${withdrawal.reference} submitted.`);
    await this.save(db);
    return withdrawal;
  }

  async getNotifications() {
    const db = await this.db();
    const user = await this.requireUser(db);
    return db.notifications
      .filter((n) => n.user_id === user.id)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  async markNotificationsRead() {
    const db = await this.db();
    const user = await this.requireUser(db);
    db.notifications.forEach((n) => {
      if (n.user_id === user.id && !n.read_at) n.read_at = new Date().toISOString();
    });
    await this.save(db);
    return true;
  }

  async getActivity() {
    const db = await this.db();
    const user = await this.requireUser(db);
    return db.activity
      .filter((a) => a.user_id === user.id)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 12);
  }

  /* ------------------------------------------------------------------ jobs */

  async getJobs({ includeClosed = false, limit } = {}) {
    const db = await this.db();
    let jobs = db.jobs
      .filter((j) => includeClosed || j.status === 'open')
      .sort((a, b) => {
        if (a.featured !== b.featured) return a.featured ? -1 : 1;
        return new Date(b.created_at) - new Date(a.created_at);
      });
    if (limit) jobs = jobs.slice(0, limit);
    return jobs;
  }

  async getJobBySlug(slug) {
    const db = await this.db();
    return db.jobs.find((j) => j.slug === slug) || null;
  }

  async getAllJobsAdmin() {
    const db = await this.db();
    await this.requireAdmin(db);
    return [...db.jobs].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  async saveJob(job) {
    const db = await this.db();
    await this.requireAdmin(db);
    const slugify = (str) =>
      String(str)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 72);
    if (job.id) {
      const idx = db.jobs.findIndex((j) => j.id === job.id);
      if (idx === -1) throw new Error('Vacancy not found.');
      db.jobs[idx] = {
        ...db.jobs[idx],
        ...job,
        salary_min: Number(job.salary_min),
        salary_max: Number(job.salary_max),
        responsibilities: Array.isArray(job.responsibilities)
          ? job.responsibilities
          : String(job.responsibilities || '').split('\n').filter(Boolean),
        requirements: Array.isArray(job.requirements)
          ? job.requirements
          : String(job.requirements || '').split('\n').filter(Boolean),
        benefits: Array.isArray(job.benefits)
          ? job.benefits
          : String(job.benefits || '').split('\n').filter(Boolean),
        updated_at: new Date().toISOString(),
      };
      this.logActivity(db, (await this.currentUser(db)).id, 'job.updated', 'job_vacancy', `Vacancy “${job.title}” updated.`);
      await this.save(db);
      return db.jobs[idx];
    }
    const created = {
      ...job,
      id: crypto.randomUUID(),
      slug: job.slug || slugify(job.title),
      salary_min: Number(job.salary_min),
      salary_max: Number(job.salary_max),
      responsibilities: Array.isArray(job.responsibilities)
        ? job.responsibilities
        : String(job.responsibilities || '').split('\n').filter(Boolean),
      requirements: Array.isArray(job.requirements)
        ? job.requirements
        : String(job.requirements || '').split('\n').filter(Boolean),
      benefits: Array.isArray(job.benefits)
        ? job.benefits
        : String(job.benefits || '').split('\n').filter(Boolean),
      status: job.status || 'open',
      featured: Boolean(job.featured),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.jobs.unshift(created);
    const admin = await this.currentUser(db);
    this.logActivity(db, admin.id, 'job.created', 'job_vacancy', `Vacancy “${created.title}” created.`);
    await this.save(db);
    return created;
  }

  async deleteJob(id) {
    const db = await this.db();
    await this.requireAdmin(db);
    const idx = db.jobs.findIndex((j) => j.id === id);
    if (idx === -1) throw new Error('Vacancy not found.');
    const [removed] = db.jobs.splice(idx, 1);
    const admin = await this.currentUser(db);
    this.logActivity(db, admin.id, 'job.deleted', 'job_vacancy', `Vacancy “${removed.title}” deleted.`);
    await this.save(db);
    return true;
  }

  /* ---------------------------------------------------------- applications */

  async submitApplication(payload) {
    const db = await this.db();
    const job = db.jobs.find((j) => j.id === payload.vacancyId || j.slug === payload.vacancySlug);
    if (!job || job.status !== 'open') throw new Error('This vacancy is no longer accepting applications.');
    const current = await this.currentUser(db);
    const application = {
      id: crypto.randomUUID ? crypto.randomUUID() : `app-${Date.now()}`,
      vacancy_id: job.id,
      user_id: current ? current.id : null,
      reference: nextRef(db, 'TO-JB'),
      full_name: payload.fullName,
      email: String(payload.email).toLowerCase(),
      phone: payload.phone,
      location: payload.location,
      qualifications: payload.qualifications,
      experience: payload.experience,
      resume_name: payload.resumeName || null,
      resume_mime: payload.resumeMime || null,
      resume_size: payload.resumeSize || null,
      status: 'submitted',
      review_notes: '',
      created_at: new Date().toISOString(),
    };
    db.applications.unshift(application);
    if (current) {
      this.notify(db, current.id, 'Application received', `Your application for ${job.title} is in review. Reference ${application.reference}. Estimated review period: 3–4 business days.`, 'application');
      this.logActivity(db, current.id, 'application.submitted', 'job_application', `Application submitted for ${job.title}.`);
    }
    await this.save(db);
    return {
      reference: application.reference,
      application: {
        ...application,
        job_title: job.title,
      },
    };
  }

  async trackApplication(reference, email) {
    const db = await this.db();
    const app = db.applications.find(
      (a) =>
        a.reference.toLowerCase() === String(reference).trim().toLowerCase() &&
        a.email.toLowerCase() === String(email).trim().toLowerCase()
    );
    if (!app) return null;
    const job = db.jobs.find((j) => j.id === app.vacancy_id);
    return {
      reference: app.reference,
      status: app.status,
      created_at: app.created_at,
      job_title: job ? job.title : 'Trump Offers',
      full_name: app.full_name,
      review_notes: app.review_notes,
    };
  }

  async getApplications() {
    const db = await this.db();
    const user = await this.requireUser(db);
    return db.applications
      .filter((a) => a.user_id === user.id)
      .map((a) => {
        const job = db.jobs.find((j) => j.id === a.vacancy_id);
        return { ...a, job_title: job?.title || 'Role', job_slug: job?.slug || '' };
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  async getAllApplicationsAdmin() {
    const db = await this.db();
    await this.requireAdmin(db);
    return db.applications
      .map((a) => {
        const job = db.jobs.find((j) => j.id === a.vacancy_id);
        return { ...a, job_title: job?.title || 'Role', job_slug: job?.slug || '' };
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  async updateApplicationStatus(id, status, reviewNotes = '') {
    const db = await this.db();
    await this.requireAdmin(db);
    const app = db.applications.find((a) => a.id === id);
    if (!app) throw new Error('Application not found.');
    app.status = status;
    app.review_notes = reviewNotes;
    app.updated_at = new Date().toISOString();
    if (app.user_id) {
      this.notify(db, app.user_id, 'Application update', `Your application ${app.reference} is now marked “${status.replaceAll('_', ' ')}”.`, 'application');
    }
    const admin = await this.currentUser(db);
    this.logActivity(db, admin.id, 'application.status', 'job_application', `Application ${app.reference} set to ${status}.`);
    await this.save(db);
    return app;
  }

  /* ----------------------------------------------------------------- cards */

  async getCardApplications() {
    const db = await this.db();
    const user = await this.requireUser(db);
    return db.card_applications
      .filter((c) => c.user_id === user.id)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  async createCardApplication({ design, cardholderName }) {
    const db = await this.db();
    const user = await this.requireUser(db);
    if (!['noir', 'champagne', 'obsidian', 'heritage'].includes(design)) {
      throw new Error('Select a card design.');
    }
    if (!cardholderName || cardholderName.trim().length < 2) {
      throw new Error('Enter the cardholder name.');
    }
    const now = new Date();
    const application = {
      id: crypto.randomUUID ? crypto.randomUUID() : `card-${Date.now()}`,
      user_id: user.id,
      reference: nextRef(db, 'TO-CD'),
      design,
      cardholder_name: cardholderName.trim().toUpperCase().slice(0, 26),
      fictional_card_number: luhnNumber('4539'),
      expiry_month: ((now.getMonth() + 3) % 12) + 1,
      expiry_year: now.getFullYear() + 3,
      status: 'under_review',
      note: 'Demonstration card application submitted for review.',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.card_applications.unshift(application);
    this.notify(db, user.id, 'Card application received', `Your demonstration card application ${application.reference} is under review.`, 'card');
    this.logActivity(db, user.id, 'card.submitted', 'card_application', `Demonstration card application ${application.reference} submitted.`);
    await this.save(db);
    return application;
  }

  async verifyCard(reference, last4) {
    const db = await this.db();
    const app = db.card_applications.find(
      (c) =>
        c.reference.toLowerCase() === String(reference).trim().toLowerCase() &&
        c.fictional_card_number.endsWith(String(last4).trim())
    );
    if (!app) return null;
    return {
      found: true,
      reference: app.reference,
      status: app.status,
      cardholder_name: app.cardholder_name,
      design: app.design,
      last4: app.fictional_card_number.slice(-4),
      created_at: app.created_at,
      note: app.note,
    };
  }

  async getAllCardsAdmin() {
    const db = await this.db();
    await this.requireAdmin(db);
    return db.card_applications
      .map((c) => {
        const user = db.users.find((u) => u.id === c.user_id);
        return { ...c, member_name: user?.full_name || 'Member', member_email: user?.email || '' };
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  async updateCardStatus(id, status, note = '') {
    const db = await this.db();
    await this.requireAdmin(db);
    const card = db.card_applications.find((c) => c.id === id);
    if (!card) throw new Error('Card application not found.');
    card.status = status;
    card.note = note || card.note;
    card.updated_at = new Date().toISOString();
    this.notify(
      db,
      card.user_id,
      status === 'approved' ? 'Demonstration card approved' : status === 'rejected' ? 'Card application update' : 'Card application update',
      status === 'approved'
        ? `Your demonstration card ${card.reference} has been approved. The card is fictional and cannot be used for payment.`
        : `Your demonstration card application ${card.reference} is now marked “${status.replaceAll('_', ' ')}”.`,
      'card'
    );
    const admin = await this.currentUser(db);
    this.logActivity(db, admin.id, 'card.status', 'card_application', `Card application ${card.reference} set to ${status}.`);
    await this.save(db);
    return card;
  }

  /* --------------------------------------------------------------- contact */

  async sendContactMessage({ name, email, phone, subject, message }) {
    const db = await this.db();
    const entry = {
      id: crypto.randomUUID ? crypto.randomUUID() : `msg-${Date.now()}`,
      name,
      email,
      phone: phone || '',
      subject,
      message,
      status: 'new',
      created_at: new Date().toISOString(),
    };
    db.messages.unshift(entry);
    await this.save(db);
    return { ok: true };
  }

  async getMessagesAdmin() {
    const db = await this.db();
    await this.requireAdmin(db);
    return [...db.messages].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  async updateMessageStatus(id, status) {
    const db = await this.db();
    await this.requireAdmin(db);
    const msg = db.messages.find((m) => m.id === id);
    if (!msg) throw new Error('Message not found.');
    msg.status = status;
    await this.save(db);
    return msg;
  }

  /* --------------------------------------------------------------- settings */

  async getSettings() {
    await this.db();
    try {
      return JSON.parse(localStorage.getItem(KEY)).settings;
    } catch {
      return SETTINGS;
    }
  }

  async saveSettings(patch) {
    const db = await this.db();
    await this.requireAdmin(db);
    db.settings = { ...db.settings, ...patch, updated_at: new Date().toISOString() };
    const admin = await this.currentUser(db);
    this.logActivity(db, admin.id, 'settings.updated', 'site_settings', 'Website configuration updated.');
    await this.save(db);
    return db.settings;
  }

  async uploadIntroVideo() {
    throw new Error('Video uploads require Supabase Storage. Use a hosted video URL instead.');
  }

  /* ----------------------------------------------------------------- admin */

  async getAdminOverview() {
    const db = await this.db();
    await this.requireAdmin(db);
    const activeClaims = db.claims.filter((c) => ['confirmed', 'verifying', 'processing'].includes(c.status));
    const pendingApps = db.applications.filter((a) =>
      ['submitted', 'under_review', 'shortlisted', 'interview'].includes(a.status)
    );
    const pendingCards = db.card_applications.filter((c) => ['submitted', 'under_review'].includes(c.status));
    const newMessages = db.messages.filter((m) => m.status === 'new');
    const recentActivity = [...db.activity]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 8)
      .map((a) => {
        const user = db.users.find((u) => u.id === a.user_id);
        return { ...a, member_name: user?.full_name || 'System' };
      });
    const months = [];
    const claimSeries = [];
    const userSeries = [];
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date();
      d.setMonth(d.getMonth() - i, 1);
      months.push(d.toLocaleString('en-US', { month: 'short' }));
      claimSeries.push(
        db.claims.filter((c) => {
          const cd = new Date(c.created_at);
          return cd.getMonth() === d.getMonth() && cd.getFullYear() === d.getFullYear();
        }).length + [3, 5, 4, 7, 6, 9][5 - i]
      );
      userSeries.push(
        db.users.filter((u) => {
          const ud = new Date(u.created_at);
          return ud.getMonth() === d.getMonth() && ud.getFullYear() === d.getFullYear();
        }).length + [4, 6, 5, 8, 7, 11][5 - i]
      );
    }
    return {
      users: db.users.length,
      claims: db.claims.length,
      activeClaims: activeClaims.length,
      applications: db.applications.length,
      pendingApplications: pendingApps.length,
      cards: db.card_applications.length,
      pendingCards: pendingCards.length,
      messages: db.messages.length,
      newMessages: newMessages.length,
      recentActivity,
      chart: { labels: months, claims: claimSeries, users: userSeries },
      mode: 'demo',
    };
  }

  /* ------------------------------------------------------- admin registers */

  async getAllClaimsAdmin() {
    const db = await this.db();
    await this.requireAdmin(db);
    return db.claims
      .map((c) => {
        const user = db.users.find((u) => u.id === c.user_id);
        return { ...c, member_name: user?.full_name || 'Member', member_email: user?.email || '' };
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  async updateClaimStatus(id, status, note = '') {
    const db = await this.db();
    const admin = await this.requireAdmin(db);
    const claim = db.claims.find((c) => c.id === id);
    if (!claim) throw new Error('Reward claim not found.');
    claim.status = status;
    if (note) claim.note = note;
    if (status === 'completed') {
      claim.progress = 100;
      claim.stage = 4;
      claim.completed_at = new Date().toISOString();
    } else if (status === 'processing') {
      claim.progress = 64;
      claim.stage = 3;
    } else if (status === 'verifying') {
      claim.progress = 22;
      claim.stage = 2;
    } else if (status === 'cancelled') {
      claim.completed_at = new Date().toISOString();
    }
    this.notify(
      db,
      claim.user_id,
      'Reward claim update',
      `Demonstration claim ${claim.reference} is now marked “${status.replaceAll('_', ' ')}”.`,
      'reward'
    );
    this.logActivity(db, admin.id, 'claim.status', 'reward_claim', `Claim ${claim.reference} set to ${status}.`);
    await this.save(db);
    return claim;
  }

  async getAllWithdrawalsAdmin() {
    const db = await this.db();
    await this.requireAdmin(db);
    return db.withdrawals
      .map((w) => {
        const user = db.users.find((u) => u.id === w.user_id);
        return { ...w, member_name: user?.full_name || 'Member', member_email: user?.email || '' };
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  async updateWithdrawalStatus(id, status, note = '') {
    const db = await this.db();
    const admin = await this.requireAdmin(db);
    const withdrawal = db.withdrawals.find((w) => w.id === id);
    if (!withdrawal) throw new Error('Withdrawal not found.');
    withdrawal.status = status;
    if (note) withdrawal.note = note;
    if (status === 'paid') withdrawal.processed_at = new Date().toISOString();
    this.notify(
      db,
      withdrawal.user_id,
      'Withdrawal update',
      status === 'paid'
        ? `Demonstration withdrawal ${withdrawal.reference} has been marked complete. No real funds were transferred.`
        : `Demonstration withdrawal ${withdrawal.reference} is now marked “${status.replaceAll('_', ' ')}”.`,
      'withdrawal'
    );
    this.logActivity(db, admin.id, 'withdrawal.status', 'withdrawal', `Withdrawal ${withdrawal.reference} set to ${status}.`);
    await this.save(db);
    return withdrawal;
  }

  async getResumeUrl() {
    return null;
  }

  async uploadSiteMedia() {
    throw new Error('Media uploads require a connected Supabase project.');
  }

  resetDemoData() {
    localStorage.removeItem(KEY);
    localStorage.removeItem(SESSION);
    this._ready = null;
  }
}

export default LocalBackend;
