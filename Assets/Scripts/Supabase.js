import * as path from "path";
import { fileURLToPath } from "url";
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const FileName = fileURLToPath(import.meta.url);
const DirName = path.dirname(FileName);

dotenv.config({
    path: path.join(DirName, '..', '..', 'Config', '.env')
});

export const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_API_KEY
);