import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  "https://aklzhhjywmkngtrieolp.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFrbHpoaGp5d21rbmd0cmllb2xwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyNzM0NjksImV4cCI6MjA4Nzg0OTQ2OX0.5AvH7Vv5vHSLsFK52rYI6A9sRnxtGrJ9FaAtLa_ziO8"
);