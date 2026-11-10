/**
 * Trump Offers — Supabase adapter.
 * All access is constrained by Row Level Security. The service-role key is
 * never present in browser code.
 */

import config from '../config.js';

const { createClient } = window.supabase;

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function friendlyError(error) {
  const message = String(error?.message || 'Something went wrong. Please try again.');
  if (/Invalid login credentials|User not found|No user found/i.test(message)) {
    return new Error('The email or password entered is incorrect.');
  }
  if (/Email not confirmed|email.*not.*confirmed/i.test(message)) {
    return new Error('Please confirm your email address before signing in. You can request a new confirmation email below.');
  }
  if (/already registered|already been registered|User already registered/i.test(message)) {
    return new Error('An account already exists with this email address.');
  }
  if (/Password should be|password.*least 8/i.test(message)) {
    return new Error('Use a password with at least 8 characters.');
  }
  if (/rate limit|too many requests/i.test(message)) {
    return new Error('Too many attempts. Please wait a moment and try again.');
  }
  if (/duplicate key/i.test(message)) return new Error('A record with those details already exists.');
  if (/row-level security/i.test(message)) return new Error('You do not have permission to perform this action.');
  if (/could not find the table|schema cache|relation .* does not exist/i.test(message)) {
    return new Error('The Supabase database is not initialised yet. Run supabase/combined.sql in the Supabase SQL editor, then try again.');
  }
  return new Error(message);
}

function single(data) {
  return Array.isArray(data) ? data[0] || null : data || null;
}

function sanitizeFileName(name = 'resume') {
  return String(name).replace(/[^a-zA-Z0-9._-]/g, '-').slice(-80);
}

class SupabaseBackend {
  constructor() {
    this.mode = 'supabase';
    this.client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'to.auth.v1',
      },
      global: {
        headers: { 'x-application-name': 'trump-offers' },
      },
    });
  }

  async profileFor(userId) {
    const read = async () => {
      const [{ data: profile, error }, { data: roles, error: roleError }] = await Promise.all([
        this.client
          .from('profiles')
          .select('id,email,full_name,phone,location,avatar_url,status,created_at')
          .eq('id', userId)
          .maybeSingle(),
        this.client.from('user_roles').select('role').eq('user_id', userId),
      ]);
      if (error) throw friendlyError(error);
      if (roleError) throw friendlyError(roleError);
      return { profile, roles };
    };

    let { profile, roles } = await read();

    // Accounts created before the provisioning trigger existed (or while the
    // database was being initialised) may have an auth user but no profile.
    // Repair it on first sign-in instead of locking the member out.
    if (!profile) {
      const { error: repairError } = await this.client.rpc('ensure_profile');
      if (!repairError) {
        ({ profile, roles } = await read());
      }
    }

    if (!profile) throw new Error('Your member profile could not be loaded. Please contact support.');
    const role = (roles || []).some((r) => r.role === 'admin') ? 'admin' : 'user';
    return { ...profile, role };
  }

  /* ------------------------------------------------------------------ auth */

  auth = {
    getSession: async () => {
      const { data, error } = await this.client.auth.getSession();
      if (error) throw friendlyError(error);
      if (!data.session) return null;
      const profile = await this.profileFor(data.session.user.id);
      if (profile.status !== 'active') {
        await this.client.auth.signOut();
        throw new Error('This account is suspended. Contact the platform administrator.');
      }
      return { user: { ...data.session.user, ...profile }, profile, session: data.session };
    },
    signIn: async ({ email, password }) => {
      const { data, error } = await this.client.auth.signInWithPassword({
        email: normalizeEmail(email),
        password,
      });
      if (error) throw friendlyError(error);
      const profile = await this.profileFor(data.user.id);
      if (profile.status !== 'active') {
        await this.client.auth.signOut();
        throw new Error('This account is suspended. Contact the platform administrator.');
      }
      return { user: { ...data.user, ...profile }, profile, session: data.session };
    },
    signUp: async ({ fullName, email, password, phone, location }) => {
      const normalized = normalizeEmail(email);
      const { data, error } = await this.client.auth.signUp({
        email: normalized,
        password,
        options: {
          data: { full_name: fullName, phone: phone || '', location: location || '' },
          emailRedirectTo: `${config.siteUrl}/login.html`,
        },
      });
      if (error) throw friendlyError(error);
      if (!data.session) {
        return {
          requiresConfirmation: true,
          email: normalized,
          message: 'Check your inbox to confirm your email address, then sign in.',
        };
      }
      await this.client.rpc('ensure_profile');
      const profile = await this.profileFor(data.user.id);
      return { user: { ...data.user, ...profile }, profile, session: data.session };
    },
    resendConfirmation: async (email) => {
      const { error } = await this.client.auth.resend({
        type: 'signup',
        email: normalizeEmail(email),
        options: { emailRedirectTo: `${config.siteUrl}/login.html` },
      });
      if (error) throw friendlyError(error);
      return { message: 'A new confirmation email has been sent. Check your inbox and spam folder.' };
    },
    signOut: async () => {
      const { error } = await this.client.auth.signOut();
      if (error) throw friendlyError(error);
      return true;
    },
    resetPassword: async ({ email }) => {
      const { error } = await this.client.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${config.siteUrl}/login.html?mode=update`,
      });
      if (error) throw friendlyError(error);
      return { message: 'If that email is registered, a secure reset link has been sent.' };
    },
    updatePassword: async (password) => {
      const { error } = await this.client.auth.updateUser({ password });
      if (error) throw friendlyError(error);
      return true;
    },
    updateProfile: async (patch) => {
      const { data: userData } = await this.client.auth.getUser();
      if (!userData.user) throw new Error('Your session has ended. Please sign in again.');
      const { data, error } = await this.client
        .from('profiles')
        .update({
          full_name: patch.full_name,
          phone: patch.phone,
          location: patch.location,
        })
        .eq('id', userData.user.id)
        .select('id,email,full_name,phone,location,avatar_url,status,created_at')
        .single();
      if (error) throw friendlyError(error);
      return { ...data, role: (await this.profileFor(userData.user.id)).role };
    },
    listUsers: async (search = '') => {
      let query = this.client
        .from('profiles')
        .select('id,email,full_name,phone,location,status,created_at,user_roles(role)')
        .order('created_at', { ascending: false })
        .limit(200);
      if (search) query = query.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`);
      const { data, error } = await query;
      if (error) throw friendlyError(error);
      return (data || []).map((u) => ({
        ...u,
        role: (u.user_roles || []).some((r) => r.role === 'admin') ? 'admin' : 'user',
      }));
    },
    setUserStatus: async (userId, status) => {
      const { data, error } = await this.client
        .from('profiles')
        .update({ status })
        .eq('id', userId)
        .select('id,email,full_name,status')
        .single();
      if (error) throw friendlyError(error);
      return data;
    },
  };

  /* --------------------------------------------------------------- rewards */

  async getRewardAccount() {
    const { data: session } = await this.client.auth.getSession();
    if (!session.session) throw new Error('Your session has ended. Please sign in again.');
    const uid = session.session.user.id;
    const [{ data: account, error }, { data: withdrawals, error: wError }] = await Promise.all([
      this.client.from('reward_accounts').select('*').eq('user_id', uid).maybeSingle(),
      this.client.from('withdrawals').select('amount,status').eq('user_id', uid).in('status', ['pending', 'reviewing', 'approved', 'processing']),
    ]);
    if (error) throw friendlyError(error);
    if (wError) throw friendlyError(wError);
    if (!account) throw new Error('Your reward account is not available.');
    const active = (withdrawals || []).reduce((sum, w) => sum + Number(w.amount), 0);
    return {
      ...account,
      available_balance: Math.max(0, Number(account.balance) - active),
    };
  }

  async getClaims() {
    const { data, error } = await this.client
      .from('reward_claims')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw friendlyError(error);
    return data || [];
  }

  async getActiveClaim() {
    const { data, error } = await this.client
      .from('reward_claims')
      .select('*')
      .in('status', ['confirmed', 'verifying', 'processing'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw friendlyError(error);
    return data || null;
  }

  async createClaim() {
    const { data, error } = await this.client.rpc('create_reward_claim');
    if (error) throw friendlyError(error);
    return single(data);
  }

  async getWithdrawals() {
    const { data, error } = await this.client
      .from('withdrawals')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw friendlyError(error);
    return data || [];
  }

  async createWithdrawal(payload) {
    const { data, error } = await this.client.rpc('request_withdrawal', {
      p_amount: Number(payload.amount),
      p_method: payload.method,
      p_account_name: payload.accountName,
      p_currency: payload.currency || 'USD',
      p_bank_name: payload.bankName || null,
      p_bank_code: payload.bankCode || null,
      p_account_number: payload.accountNumber || null,
      p_account_reference: payload.accountReference || null,
      p_crypto_asset: payload.cryptoAsset || null,
      p_crypto_network: payload.cryptoNetwork || null,
      p_wallet_address: payload.walletAddress || null,
      p_card_payment_account_id: payload.cardPaymentAccountId || null,
      p_idempotency_key: payload.idempotencyKey || null,
    });
    if (error) throw friendlyError(error);
    return single(data);
  }

  async getWithdrawalMethods() {
    const [{ data: methods, error }, { data: networks, error: networkError }] = await Promise.all([
      this.client.from('withdrawal_methods').select('*').eq('enabled', true).order('sort_order'),
      this.client.from('crypto_networks').select('*').eq('enabled', true).order('sort_order'),
    ]);
    if (error) throw friendlyError(error);
    if (networkError) throw friendlyError(networkError);
    return { methods: methods || [], networks: networks || [] };
  }

  async getWithdrawalDetail(id) {
    const { data, error } = await this.client.rpc('admin_get_withdrawal_details', { p_id: id });
    if (error) throw friendlyError(error);
    return data;
  }

  async getWithdrawalHistory(id) {
    const { data, error } = await this.client
      .from('withdrawal_status_history')
      .select('*')
      .eq('withdrawal_id', id)
      .order('created_at', { ascending: true });
    if (error) throw friendlyError(error);
    return data || [];
  }

  async getPaymentAccounts() {
    const { data, error } = await this.client
      .from('payment_accounts')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw friendlyError(error);
    return data || [];
  }

  async savePaymentAccount(account) {
    const { data: session } = await this.client.auth.getSession();
    if (!session.session) throw new Error('Your session has ended. Please sign in again.');
    const payload = {
      user_id: session.session.user.id,
      type: account.type,
      provider: account.provider || 'manual',
      provider_token: account.providerToken || null,
      label: account.label || '',
      account_holder: account.accountHolder || null,
      bank_name: account.bankName || null,
      bank_code: account.bankCode || null,
      account_last4: account.accountLast4 || null,
      iban_last4: account.ibanLast4 || null,
      crypto_asset: account.cryptoAsset || null,
      crypto_network: account.cryptoNetwork || null,
      wallet_address: account.walletAddress || null,
      card_brand: account.cardBrand || null,
      card_last4: account.cardLast4 || null,
      card_exp_month: account.cardExpMonth || null,
      card_exp_year: account.cardExpYear || null,
      is_default: Boolean(account.isDefault),
    };
    const { data, error } = await this.client.from('payment_accounts').insert(payload).select('*').single();
    if (error) throw friendlyError(error);
    return data;
  }

  async deletePaymentAccount(id) {
    const { error } = await this.client.from('payment_accounts').update({ status: 'revoked' }).eq('id', id);
    if (error) throw friendlyError(error);
    return true;
  }

  async getNotifications() {
    const { data, error } = await this.client
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw friendlyError(error);
    return data || [];
  }

  async markNotificationsRead() {
    const { data: session } = await this.client.auth.getSession();
    if (!session.session) throw new Error('Your session has ended.');
    const { error } = await this.client
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', session.session.user.id)
      .is('read_at', null);
    if (error) throw friendlyError(error);
    return true;
  }

  async getActivity() {
    const { data, error } = await this.client
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(12);
    if (error) throw friendlyError(error);
    return data || [];
  }

  /* ------------------------------------------------------------------ jobs */

  async getJobs({ includeClosed = false, limit } = {}) {
    let query = this.client.from('job_vacancies').select('*').order('featured', { ascending: false }).order('created_at', { ascending: false });
    if (!includeClosed) query = query.eq('status', 'open');
    if (limit) query = query.limit(limit);
    const { data, error } = await query;
    if (error) throw friendlyError(error);
    return data || [];
  }

  async getJobBySlug(slug) {
    const { data, error } = await this.client.from('job_vacancies').select('*').eq('slug', slug).maybeSingle();
    if (error) throw friendlyError(error);
    return data || null;
  }

  async getAllJobsAdmin() {
    const { data, error } = await this.client
      .from('job_vacancies')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw friendlyError(error);
    return data || [];
  }

  async saveJob(job) {
    const payload = {
      title: job.title,
      slug: job.slug,
      department: job.department,
      employment_type: job.employment_type,
      work_mode: job.work_mode,
      location: job.location,
      salary_min: Number(job.salary_min),
      salary_max: Number(job.salary_max),
      currency: job.currency || 'USD',
      summary: job.summary,
      description: job.description,
      responsibilities: job.responsibilities,
      requirements: job.requirements,
      benefits: job.benefits,
      deadline: job.deadline,
      status: job.status || 'open',
      featured: Boolean(job.featured),
    };
    const { data, error } = job.id
      ? await this.client.from('job_vacancies').update(payload).eq('id', job.id).select('*').single()
      : await this.client.from('job_vacancies').insert(payload).select('*').single();
    if (error) throw friendlyError(error);
    return data;
  }

  async deleteJob(id) {
    const { error } = await this.client.from('job_vacancies').delete().eq('id', id);
    if (error) throw friendlyError(error);
    return true;
  }

  /* ---------------------------------------------------------- applications */

  async submitApplication(payload) {
    let resumePath = null;
    if (payload.file) {
      const path = `applications/${crypto.randomUUID()}/${sanitizeFileName(payload.file.name)}`;
      const { error: uploadError } = await this.client.storage.from('resumes').upload(path, payload.file, {
        contentType: payload.file.type || 'application/octet-stream',
        upsert: false,
      });
      if (uploadError) throw new Error(`We could not upload your resume. ${uploadError.message}`);
      resumePath = path;
    }
    const { data, error } = await this.client.rpc('submit_job_application', {
      p_vacancy_id: payload.vacancyId,
      p_full_name: payload.fullName,
      p_email: payload.email,
      p_phone: payload.phone,
      p_location: payload.location,
      p_qualifications: payload.qualifications,
      p_experience: payload.experience,
      p_resume_path: resumePath,
      p_resume_name: payload.resumeName || null,
      p_resume_mime: payload.resumeMime || null,
      p_resume_size: payload.resumeSize || null,
    });
    if (error) throw friendlyError(error);
    return single(data);
  }

  async trackApplication(reference, email) {
    const { data, error } = await this.client.rpc('track_application', {
      p_reference: reference.trim(),
      p_email: email.trim().toLowerCase(),
    });
    if (error) throw friendlyError(error);
    return single(data);
  }

  async getApplications() {
    const { data, error } = await this.client
      .from('job_applications')
      .select('*, job_vacancies(title,slug)')
      .order('created_at', { ascending: false });
    if (error) throw friendlyError(error);
    return (data || []).map((a) => ({
      ...a,
      job_title: a.job_vacancies?.title || 'Role',
      job_slug: a.job_vacancies?.slug || '',
    }));
  }

  async getAllApplicationsAdmin() {
    const { data, error } = await this.client
      .from('job_applications')
      .select('*, job_vacancies(title,slug)')
      .order('created_at', { ascending: false });
    if (error) throw friendlyError(error);
    return (data || []).map((a) => ({
      ...a,
      job_title: a.job_vacancies?.title || 'Role',
      job_slug: a.job_vacancies?.slug || '',
    }));
  }

  async updateApplicationStatus(id, status, reviewNotes = '') {
    const { data, error } = await this.client
      .from('job_applications')
      .update({ status, review_notes: reviewNotes })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw friendlyError(error);
    return data;
  }

  /* ----------------------------------------------------------------- cards */

  async getCardApplications() {
    const { data, error } = await this.client
      .from('card_applications')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw friendlyError(error);
    return data || [];
  }

  async createCardApplication({ design, cardholderName }) {
    const { data, error } = await this.client.rpc('create_card_application', {
      p_design: design,
      p_cardholder_name: cardholderName,
    });
    if (error) throw friendlyError(error);
    return single(data);
  }

  async verifyCard(reference, last4) {
    const { data, error } = await this.client.rpc('verify_demo_card', {
      p_reference: reference.trim(),
      p_last4: String(last4).trim(),
    });
    if (error) throw friendlyError(error);
    return single(data);
  }

  async getAllCardsAdmin() {
    const { data, error } = await this.client
      .from('card_applications')
      .select('*, profiles(full_name,email)')
      .order('created_at', { ascending: false });
    if (error) throw friendlyError(error);
    return (data || []).map((c) => ({
      ...c,
      member_name: c.profiles?.full_name || 'Member',
      member_email: c.profiles?.email || '',
    }));
  }

  async updateCardStatus(id, status, note = '') {
    const { data, error } = await this.client
      .from('card_applications')
      .update({ status, note })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw friendlyError(error);
    return data;
  }

  /* --------------------------------------------------------------- contact */

  async sendContactMessage({ name, email, phone, subject, message }) {
    const { error } = await this.client.from('contact_messages').insert({
      name,
      email: email.trim().toLowerCase(),
      phone: phone || null,
      subject,
      message,
    });
    if (error) throw friendlyError(error);
    return { ok: true };
  }

  async getMessagesAdmin() {
    const { data, error } = await this.client
      .from('contact_messages')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw friendlyError(error);
    return data || [];
  }

  async updateMessageStatus(id, status) {
    const { data, error } = await this.client
      .from('contact_messages')
      .update({ status })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw friendlyError(error);
    return data;
  }

  /* --------------------------------------------------------------- settings */

  async getSettings() {
    const { data, error } = await this.client
      .from('site_settings')
      .select('key,value')
      .eq('is_public', true);
    if (error) throw friendlyError(error);
    return (data || []).reduce((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});
  }

  async saveSettings(patch) {
    const rows = Object.entries(patch).map(([key, value]) => ({ key, value, is_public: true }));
    const { error } = await this.client.from('site_settings').upsert(rows, { onConflict: 'key' });
    if (error) throw friendlyError(error);
    return this.getSettings();
  }

  async uploadIntroVideo(file) {
    const path = `intro/${Date.now()}-${sanitizeFileName(file.name)}`;
    const { error } = await this.client.storage.from('site-media').upload(path, file, {
      contentType: file.type || 'video/mp4',
      upsert: false,
    });
    if (error) throw new Error(`The video could not be uploaded. ${error.message}`);
    const { data } = this.client.storage.from('site-media').getPublicUrl(path);
    await this.saveSettings({ intro_video_url: data.publicUrl });
    return data.publicUrl;
  }

  /* ------------------------------------------------------- admin registers */

  async getAllClaimsAdmin() {
    const { data, error } = await this.client
      .from('reward_claims')
      .select('*, profiles(full_name,email)')
      .order('created_at', { ascending: false });
    if (error) throw friendlyError(error);
    return (data || []).map((c) => ({
      ...c,
      member_name: c.profiles?.full_name || 'Member',
      member_email: c.profiles?.email || '',
    }));
  }

  async updateClaimStatus(id, status, note = '') {
    const patch = { status };
    if (note) patch.note = note;
    if (status === 'completed') {
      patch.progress = 100;
      patch.stage = 4;
      patch.completed_at = new Date().toISOString();
    } else if (status === 'processing') {
      patch.progress = 64;
      patch.stage = 3;
    } else if (status === 'verifying') {
      patch.progress = 22;
      patch.stage = 2;
    }
    const { data, error } = await this.client
      .from('reward_claims')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw friendlyError(error);
    return data;
  }

  async getAllWithdrawalsAdmin() {
    const { data, error } = await this.client
      .from('withdrawals')
      .select('*, profiles(full_name,email)')
      .order('created_at', { ascending: false });
    if (error) throw friendlyError(error);
    return (data || []).map((w) => ({
      ...w,
      member_name: w.profiles?.full_name || 'Member',
      member_email: w.profiles?.email || '',
    }));
  }

  async updateWithdrawalStatus(id, status, note = '', providerConfirmed = false, providerReference = '') {
    const { data, error } = await this.client.rpc('admin_update_withdrawal_status', {
      p_id: id,
      p_status: status,
      p_note: note,
      p_provider_reference: providerReference || null,
      p_provider_confirmed: Boolean(providerConfirmed),
    });
    if (error) throw friendlyError(error);
    return single(data);
  }

  async addWithdrawalNote(id, note) {
    const { data, error } = await this.client.rpc('admin_add_withdrawal_note', {
      p_id: id,
      p_note: note,
    });
    if (error) throw friendlyError(error);
    return single(data);
  }

  async getResumeUrl(path) {
    if (!path) return null;
    const { data, error } = await this.client.storage.from('resumes').createSignedUrl(path, 120);
    if (error) throw friendlyError(error);
    return data.signedUrl;
  }

  /* ----------------------------------------------------------------- admin */

  async getAdminOverview() {
    const head = { count: 'exact', head: true };
    const [
      users,
      claims,
      applications,
      pendingApplications,
      cards,
      pendingCards,
      messages,
      newMessages,
      activity,
      claimsChart,
      usersChart,
    ] = await Promise.all([
      this.client.from('profiles').select('id', head),
      this.client.from('reward_claims').select('id', head),
      this.client.from('job_applications').select('id', head),
      this.client.from('job_applications').select('id', head).in('status', ['submitted', 'under_review', 'shortlisted', 'interview']),
      this.client.from('card_applications').select('id', head),
      this.client.from('card_applications').select('id', head).in('status', ['submitted', 'under_review']),
      this.client.from('contact_messages').select('id', head),
      this.client.from('contact_messages').select('id', head).eq('status', 'new'),
      this.client.from('activity_logs').select('*, profiles(full_name)').order('created_at', { ascending: false }).limit(8),
      this.client.from('reward_claims').select('created_at').gte('created_at', new Date(Date.now() - 180 * 86400000).toISOString()),
      this.client.from('profiles').select('created_at').gte('created_at', new Date(Date.now() - 180 * 86400000).toISOString()),
    ]);
    for (const res of [users, claims, applications, pendingApplications, cards, pendingCards, messages, newMessages, activity, claimsChart, usersChart]) {
      if (res.error) throw friendlyError(res.error);
    }
    const labels = [];
    const claimSeries = [];
    const userSeries = [];
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date();
      d.setMonth(d.getMonth() - i, 1);
      labels.push(d.toLocaleString('en-US', { month: 'short' }));
      claimSeries.push((claimsChart.data || []).filter((r) => {
        const cd = new Date(r.created_at);
        return cd.getMonth() === d.getMonth() && cd.getFullYear() === d.getFullYear();
      }).length);
      userSeries.push((usersChart.data || []).filter((r) => {
        const ud = new Date(r.created_at);
        return ud.getMonth() === d.getMonth() && ud.getFullYear() === d.getFullYear();
      }).length);
    }
    const activeClaims = (await this.client.from('reward_claims').select('id', head).in('status', ['confirmed', 'verifying', 'processing'])).count || 0;
    return {
      users: users.count || 0,
      claims: claims.count || 0,
      activeClaims,
      applications: applications.count || 0,
      pendingApplications: pendingApplications.count || 0,
      cards: cards.count || 0,
      pendingCards: pendingCards.count || 0,
      messages: messages.count || 0,
      newMessages: newMessages.count || 0,
      recentActivity: (activity.data || []).map((a) => ({ ...a, member_name: a.profiles?.full_name || 'Member' })),
      chart: { labels, claims: claimSeries, users: userSeries },
      mode: 'supabase',
    };
  }
}

export default SupabaseBackend;
