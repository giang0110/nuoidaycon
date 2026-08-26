-- Interest vocabulary. Global reference data, read-only for clients.
-- Loaded by the seed script running as owner, never by the application.
insert into public.interests (slug, label_vi, label_en, sort_order) values
  ('animals',        'Động vật',            'Animals',        10),
  ('space',          'Vũ trụ',              'Space',          20),
  ('dinosaurs',      'Khủng long',          'Dinosaurs',      30),
  ('vehicles',       'Xe cộ',               'Vehicles',       40),
  ('nature',         'Thiên nhiên',         'Nature',         50),
  ('ocean',          'Đại dương',           'Ocean',          60),
  ('cooking',        'Nấu ăn',              'Cooking',        70),
  ('music',          'Âm nhạc',             'Music',          80),
  ('sports',         'Thể thao',            'Sports',         90),
  ('drawing',        'Vẽ',                  'Drawing',       100),
  ('family',         'Gia đình',            'Family',        110),
  ('friends',        'Bạn bè',              'Friends',       120),
  ('fairy-tales',    'Truyện cổ tích',      'Fairy tales',   130),
  ('science',        'Khoa học',            'Science',       140),
  ('plants',         'Cây cối',             'Plants',        150),
  ('weather',        'Thời tiết',           'Weather',       160),
  ('travel',         'Du lịch',             'Travel',        170),
  ('building',       'Xây dựng, lắp ghép',  'Building',      180),
  ('festivals',      'Lễ hội',              'Festivals',     190),
  ('helping',        'Giúp đỡ mọi người',   'Helping',       200)
on conflict (slug) do update
  set label_vi = excluded.label_vi,
      label_en = excluded.label_en,
      sort_order = excluded.sort_order;
