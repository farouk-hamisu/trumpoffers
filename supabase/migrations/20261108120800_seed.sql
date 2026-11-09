-- ============================================================================
-- Trump Offers — 09 · Initial site configuration and vacancies
-- Safe to re-run: existing customisations are never overwritten.
-- ============================================================================

insert into public.site_settings (key, value, is_public)
values
  ('site_name', to_jsonb('Trump Offers'::text), true),
  ('tagline', to_jsonb('Opportunities. Rewards. Possibilities.'::text), true),
  ('hero_headline', to_jsonb('Opportunities. Rewards. Possibilities.'::text), true),
  ('hero_support', to_jsonb('Explore opportunities, discover career possibilities and experience a modern demonstration rewards platform designed around simplicity and accessibility.'::text), true),
  ('support_email', to_jsonb('concierge@trumpoffers.com'::text), true),
  ('support_phone', to_jsonb('+1 (212) 555-0184'::text), true),
  ('address', to_jsonb('One Trump Place, Suite 1200, New York, NY 10004'::text), true),
  ('office_hours', to_jsonb('Monday–Friday, 9:00–18:00 ET'::text), true),
  ('intro_video_url', to_jsonb('assets/videos/trump-intro.mp4'::text), true),
  ('intro_video_enabled', to_jsonb(true), true),
  ('intro_autoplay', to_jsonb(false), true),
  ('announcement', to_jsonb(''::text), true),
  ('linkedin_url', to_jsonb('https://www.linkedin.com/'::text), true),
  ('instagram_url', to_jsonb('https://www.instagram.com/'::text), true)
on conflict (key) do nothing;

insert into public.job_vacancies (
  slug, title, department, employment_type, work_mode, location,
  salary_min, salary_max, currency, summary, description,
  responsibilities, requirements, benefits, deadline, status, featured, created_at
)
values
  (
    'private-client-advisor',
    'Private Client Advisor',
    'Client Services',
    'Full-time',
    'Hybrid',
    'New York, NY',
    118000,
    145000,
    'USD',
    'Guide members through their rewards journey with discretion, clarity and an unusual level of care.',
    'Trump Offers is building a new kind of rewards and opportunity platform. As a Private Client Advisor, you will be the considered voice members meet at every important moment — from their first reward claim to their first introduction to a hiring partner.

This is a relationship role in the truest sense. You will work across a small portfolio of members, anticipate needs before they are articulated, and turn complexity into calm. You will partner closely with Operations, Product and Recruitment to make sure every promise the platform makes is kept.',
    array[
      'Own a portfolio of member relationships across rewards, cards and career introductions.',
      'Guide members through demonstration workflows with clear, jargon-free communication.',
      'Translate recurring member feedback into concise product and operations briefs.',
      'Partner with recruitment teams to coordinate warm candidate introductions.',
      'Maintain meticulous records and uphold the platform’s privacy standards.'
    ],
    array[
      '4+ years in private banking, premium hospitality, client services or a related field.',
      'Exceptional written communication and a naturally discreet manner.',
      'Comfort working with modern productivity and CRM tools.',
      'A calm, structured approach to competing priorities.',
      'Authorization to work in the United States.'
    ],
    array[
      'Competitive base salary and performance award',
      'Comprehensive health and wellbeing cover',
      'Hybrid schedule with a beautiful Manhattan studio',
      'Annual learning and travel allowance'
    ],
    current_date + 38,
    'open',
    true,
    now() - interval '6 days'
  ),
  (
    'product-designer-digital-card',
    'Product Designer, Digital Card',
    'Product Design',
    'Full-time',
    'Remote',
    'London, United Kingdom',
    96000,
    124000,
    'USD',
    'Shape the most tactile, considered digital card experience in the rewards category.',
    'We are looking for a product designer with a sharp editorial eye and a respect for the quiet details that make a product feel expensive. You will own the end-to-end design of the Trump demonstration card: application, presentation, verification and administration.

You will work directly with engineering and brand, moving from wide explorations to production-ready specifications without losing the idea. We care deeply about craft, but we care more about clarity.',
    array[
      'Design end-to-end flows for the demonstration card, from application to verification.',
      'Build and maintain a small, rigorous design system for the card surfaces.',
      'Prototype interactions and test them with members and internal teams.',
      'Pair with engineers to protect quality through implementation.',
      'Present work clearly to senior stakeholders.'
    ],
    array[
      'A portfolio demonstrating strong visual and interaction design.',
      '3+ years designing consumer or fintech products.',
      'Fluency in Figma, prototyping and design-system practice.',
      'A thoughtful approach to accessibility and responsive behaviour.',
      'Excellent written communication in English.'
    ],
    array[
      'Remote-first with quarterly team gatherings',
      'Home-office and equipment budget',
      'Private health cover and pension contribution',
      'Four-day summer weeks'
    ],
    current_date + 24,
    'open',
    true,
    now() - interval '3 days'
  ),
  (
    'rewards-operations-associate',
    'Rewards Operations Associate',
    'Operations',
    'Full-time',
    'On-site',
    'New York, NY',
    64000,
    78000,
    'USD',
    'Keep every demonstration claim, withdrawal and card application moving with precision.',
    'The Rewards Operations Associate sits at the centre of the platform. You will review demonstration records, maintain service levels, and make sure members always know exactly where things stand.

You will be joining a small operations team with a broad mandate. Expect to improve processes as often as you run them, and to work closely with the administrators who oversee the platform.',
    array[
      'Review and progress demonstration reward claims and withdrawal requests.',
      'Maintain claim records, reference numbers and status accuracy.',
      'Escalate anomalies and document resolutions clearly.',
      'Support member enquiries with accurate, kind responses.',
      'Contribute to operational playbooks and service-level reporting.'
    ],
    array[
      '1–3 years in operations, financial services or customer support.',
      'Meticulous attention to detail and strong numeracy.',
      'Comfort with spreadsheets and operations dashboards.',
      'Clear written communication and a steady temperament.',
      'New York based or willing to relocate.'
    ],
    array[
      'Performance-linked annual award',
      'Medical, dental and vision cover',
      'Commuter and wellness allowances',
      'Structured development pathway'
    ],
    current_date + 31,
    'open',
    true,
    now() - interval '8 days'
  ),
  (
    'recruitment-partner',
    'Recruitment Partner',
    'People & Culture',
    'Full-time',
    'Remote',
    'United States',
    82000,
    98000,
    'USD',
    'Connect exceptional people with the teams building a more considered rewards platform.',
    'As Recruitment Partner you will own hiring across product, operations and client services. You will design calm, respectful processes and represent Trump Offers with the same care our members experience.

This role suits someone who believes recruitment is a craft: part listening, part storytelling and part operating discipline.',
    array[
      'Own full-cycle hiring for product, operations and client teams.',
      'Partner with hiring managers on role design and interview structure.',
      'Build thoughtful candidate communications and feedback loops.',
      'Maintain accurate applicant records and reporting.',
      'Champion an equitable, accessible hiring experience.'
    ],
    array[
      '3+ years of in-house or agency recruitment experience.',
      'Evidence of hiring for both technical and operational roles.',
      'Strong interviewing and stakeholder-management skills.',
      'Comfort with applicant tracking systems and data hygiene.',
      'Based in the United States.'
    ],
    array[
      'Remote-first with a connected team culture',
      'Annual learning stipend',
      'Health and wellbeing cover',
      'Generous paid leave'
    ],
    current_date + 45,
    'open',
    false,
    now() - interval '11 days'
  ),
  (
    'brand-content-strategist',
    'Brand & Content Strategist',
    'Marketing',
    'Contract',
    'Hybrid',
    'London, United Kingdom',
    70000,
    90000,
    'USD',
    'Write the words that make a demonstration platform feel considered, credible and human.',
    'We are looking for a brand writer and content strategist for a twelve-month contract. You will shape the voice of Trump Offers across product, web and member communications.

The ideal candidate has a portfolio of editorial or premium brand work, a dislike of filler, and the discipline to make every sentence earn its place.',
    array[
      'Define and maintain the Trump Offers tone of voice.',
      'Write product copy, member communications and editorial features.',
      'Partner with design on campaign concepts and art direction.',
      'Review copy across the platform for clarity and consistency.',
      'Build a lightweight content style guide.'
    ],
    array[
      'A portfolio of premium brand, editorial or product writing.',
      '5+ years in copywriting or content strategy.',
      'Exceptional editing instincts and attention to detail.',
      'Comfort working across time zones.',
      'Available for a twelve-month contract.'
    ],
    array[
      'Day rate commensurate with experience',
      'Hybrid studio access in London',
      'Quarterly team gatherings',
      'A genuinely calm working culture'
    ],
    current_date + 19,
    'open',
    false,
    now() - interval '2 days'
  ),
  (
    'risk-compliance-analyst',
    'Risk & Compliance Analyst',
    'Risk',
    'Full-time',
    'On-site',
    'Singapore',
    88000,
    106000,
    'USD',
    'Design the controls that keep a simulated rewards environment safe, honest and well-governed.',
    'You will help define the standards that govern a demonstration rewards platform: data minimisation, clear disclosures, secure access and reliable audit trails.

This is a hands-on role for someone who enjoys turning principles into practical controls and can explain them to non-specialists.',
    array[
      'Maintain the platform risk register and control documentation.',
      'Review data handling and access practices against policy.',
      'Support incident response and audit preparation.',
      'Advise product teams on disclosure and consumer-protection requirements.',
      'Produce clear monthly risk reporting for leadership.'
    ],
    array[
      '3+ years in risk, compliance or audit within financial services.',
      'Working knowledge of data-protection frameworks.',
      'Strong analytical writing and documentation skills.',
      'Ability to influence without authority.',
      'Based in Singapore or willing to relocate.'
    ],
    array[
      'Competitive salary and annual award',
      'Comprehensive medical cover',
      'Professional certification support',
      'Central Singapore office'
    ],
    current_date + 52,
    'open',
    false,
    now() - interval '9 days'
  )
on conflict (slug) do nothing;
