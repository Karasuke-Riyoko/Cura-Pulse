-- CuraPulse demo data. Run AFTER curapulse_schema.sql. Safe to re-run (deletes its own rows first).
-- Every demo row is tagged so it can be removed: names end with "(demo)" or ids start with "seed-".

delete from public.chat_messages      where thread_id like 'seed-%';
delete from public.appointments       where arrival_token like 'SEED-%';
delete from public.prescriptions      where rx_hash like 'seed-%';
delete from public.sos_incidents      where patient_name like '%(demo)';
delete from public.doctor_applications where id like 'seed-%';

-- Doctor applications waiting in Support Desk → Verify
insert into public.doctor_applications
  (id, full_name, email, phone, age, sex, nmc_registration_id, state_medical_council, degree, specialty,
   experience_years, hospital_affiliation, consultation_fee, working_hours, notes, documents, ai_review, verification_status)
values
 ('seed-app-1','Dr. Kavya Iyer (demo)','kavya.demo@curapulse.app','9810000001',34,'Female','DMC/R/08812','Delhi Medical Council','MBBS, MD','Gynaecology',
  8,'Max Hospital, Saket',600,'Mon–Sat 10:00–16:00','Happy to take women-only consults.',array['md_certificate.pdf'],
  '{"verdict":"LOOKS_VALID","document_type":"MD degree certificate","summary":"Name, degree and university are readable and match the form.","issues":[],"source":"seed","extracted":{}}','PENDING'),
 ('seed-app-2','Dr. Arjun Mehta (demo)','arjun.demo@curapulse.app','9810000002',29,'Male','MMC/2019/4471','Maharashtra Medical Council','MBBS','General Physician',
  4,'Ruby Hall Clinic, Pune',400,'Mon–Fri 09:00–14:00','',array['mbbs_certificate.jpg'],
  '{"verdict":"NEEDS_ATTENTION","document_type":"MBBS certificate","summary":"Registration number on the document differs from the form.","issues":["Registration number on certificate is MMC/2019/4417, form says 4471","Image is slightly blurred at the seal"],"source":"seed","extracted":{}}','PENDING'),
 ('seed-app-3','Dr. Neha Kapoor (demo)','neha.demo@curapulse.app','9810000003',45,'Female','PMC/11290','Punjab Medical Council','MBBS, DM','Cardiology',
  17,'Fortis, Mohali',900,'Tue–Sat 11:00–17:00','',array['dm_cardiology.pdf'],
  '{"verdict":"LOOKS_VALID","document_type":"DM certificate","summary":"Clear document, details match.","issues":[],"source":"seed","extracted":{}}','VERIFIED_ACTIVE');

-- Open SOS alerts for the Support Desk and Admin
insert into public.sos_incidents (patient_name, phone, blood_group, allergies, chronic_conditions, latitude, longitude, status, created_at)
values
 ('Meera Joshi (demo)','9820011122','O+',array['Penicillin'],array['Asthma'],28.6139,77.2090,'ACTIVE', now() - interval '3 minutes'),
 ('Rahul Verma (demo)','9820033344','B+',array[]::text[],array['Type 2 diabetes'],28.5355,77.3910,'ACTIVE', now() - interval '11 minutes'),
 ('Fatima Sheikh (demo)','9820055566','A-',array['Sulfa drugs'],array[]::text[],28.4595,77.0266,'RESOLVED', now() - interval '2 hours');

-- Doctor queue (doctor portal) – today's appointments
insert into public.appointments
  (arrival_token, patient_id, patient_name, age, gender, blood_group, allergies, chronic_illnesses, chief_complaint, slot, doctor_id, doctor_name, chaperone_requested, status)
values
 ('SEED-101','seed-p1','Ananya Rao (demo)',27,'Female','B+',array['Dust'],array[]::text[],'Fever and sore throat for 2 days','10:30 AM','d1','Dr. Sunita Sharma',true,'Waiting'),
 ('SEED-102','seed-p2','Vikram Singh (demo)',52,'Male','O+',array[]::text[],array['Hypertension'],'BP readings high at home','11:00 AM','d1','Dr. Sunita Sharma',false,'Waiting'),
 ('SEED-103','seed-p3','Priya Nair (demo)',34,'Female','AB+',array['Penicillin'],array['Thyroid'],'Follow-up on thyroid test','11:30 AM','d1','Dr. Sunita Sharma',false,'In Consultation');

-- A finished prescription (doctor never prescribes through AI; this is a doctor-issued sample)
insert into public.prescriptions (rx_hash, arrival_token, patient_name, doctor_name, nmc_reg, diagnosis, findings, medicines, advice)
values
 ('seed-rx-1','SEED-103','Priya Nair (demo)','Dr. Sunita Sharma','DMC/R/12345','Hypothyroidism – follow-up','TSH 5.8 mIU/L',
  '[{"name":"Levothyroxine 50 mcg","dose":"1 tablet","frequency":"Once daily, empty stomach","days":"30"}]',
  array['Repeat TSH after 6 weeks','Take tablet 30 minutes before breakfast']);

-- Chat history so the doctor and support inboxes aren't empty
insert into public.chat_messages (thread_id, patient_id, patient_name, doctor_id, doctor_name, sender, body, created_at)
values
 ('seed-p1:d1','seed-p1','Ananya Rao (demo)','d1','Dr. Sunita Sharma','patient','Hello doctor, I have fever since yesterday.', now() - interval '20 minutes'),
 ('seed-p1:d1','seed-p1','Ananya Rao (demo)','d1','Dr. Sunita Sharma','doctor','Hi Ananya. What was your highest temperature?', now() - interval '18 minutes'),
 ('seed-p1:d1','seed-p1','Ananya Rao (demo)','d1','Dr. Sunita Sharma','patient','101.5°F last night.', now() - interval '17 minutes'),
 ('seed-p2:support','seed-p2','Vikram Singh (demo)','support','Support Desk','patient','My appointment slot is not showing, can you check?', now() - interval '40 minutes'),
 ('seed-p2:support','seed-p2','Vikram Singh (demo)','support','Support Desk','doctor','Checked, you are booked for 11:00 AM with Dr. Sunita.', now() - interval '35 minutes');
