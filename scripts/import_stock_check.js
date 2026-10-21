/**
 * Stock Check Physical Audit Importer
 * Ingests physical inventory counts from audited sheets (Images 1-7)
 * into Supabase inventory table with categories, realistic Kenyan hardware pricing,
 * and maintains existing packaging tiers (Thread tape pack/pcs).
 */

const { supabase } = require('../tests/helpers/testClient');

const AUDITED_ITEMS = [
    // ==========================================
    // SHEET 1: PVC Drainage & Waste Fittings
    // ==========================================
    {
        name: 'Waste Bend 1 1/2" 90°',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 37,
        buying_price: 45,
        selling_price: 70,
        min_threshold: 5
    },
    {
        name: 'Waste Bend 1 1/2" 45°',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 35,
        buying_price: 45,
        selling_price: 70,
        min_threshold: 5
    },
    {
        name: 'Waste Bend 2" 45°',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 32,
        buying_price: 70,
        selling_price: 100,
        min_threshold: 5
    },
    {
        name: 'Waste Bend 3" 90°',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 18,
        buying_price: 130,
        selling_price: 180,
        min_threshold: 5
    },
    {
        name: 'Waste Bend 4" 90°',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 30,
        buying_price: 220,
        selling_price: 300,
        min_threshold: 5
    },
    {
        name: 'Waste Bend 1 1/4"',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 3,
        buying_price: 40,
        selling_price: 60,
        min_threshold: 3
    },
    {
        name: 'Waste Tee 1 1/2"',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 33,
        buying_price: 55,
        selling_price: 80,
        min_threshold: 5
    },
    {
        name: 'Waste Tee 2"',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 33,
        buying_price: 80,
        selling_price: 120,
        min_threshold: 5
    },
    {
        name: 'Waste Tee 3"',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 12,
        buying_price: 160,
        selling_price: 220,
        min_threshold: 4
    },
    {
        name: 'Inspection Tee 1 1/2"',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 6,
        buying_price: 75,
        selling_price: 110,
        min_threshold: 3
    },
    {
        name: 'Inspection Tee 2"',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 3,
        buying_price: 100,
        selling_price: 150,
        min_threshold: 3
    },
    {
        name: 'Inspection Tee 4"',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 6,
        buying_price: 250,
        selling_price: 350,
        min_threshold: 3
    },
    {
        name: 'Vent Cap 4"',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 17,
        buying_price: 120,
        selling_price: 180,
        min_threshold: 4
    },
    {
        name: 'Waste Plug 1 1/2"',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 36,
        buying_price: 30,
        selling_price: 50,
        min_threshold: 5
    },
    {
        name: 'Waste Plug 2"',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 80,
        buying_price: 40,
        selling_price: 60,
        min_threshold: 10
    },
    {
        name: 'Floor Trap 1-Way',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 15,
        buying_price: 180,
        selling_price: 250,
        min_threshold: 5
    },
    {
        name: 'Floor Trap Cover 1-Way',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 13,
        buying_price: 60,
        selling_price: 100,
        min_threshold: 4
    },
    {
        name: 'Floor Trap 4-Way',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 4,
        buying_price: 250,
        selling_price: 350,
        min_threshold: 3
    },
    {
        name: 'Floor Trap Cover 4-Way',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 11,
        buying_price: 80,
        selling_price: 120,
        min_threshold: 4
    },
    {
        name: 'Waste Reducer 2" x 1 1/2"',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 16,
        buying_price: 50,
        selling_price: 80,
        min_threshold: 4
    },
    {
        name: 'Reducer 3" x 2"',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 8,
        buying_price: 90,
        selling_price: 130,
        min_threshold: 3
    },
    {
        name: 'Reducer 4" x 2"',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 8,
        buying_price: 140,
        selling_price: 200,
        min_threshold: 3
    },
    {
        name: 'Reducer 4" x 3"',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 11,
        buying_price: 160,
        selling_price: 220,
        min_threshold: 3
    },
    {
        name: 'Gutter Clips',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 8,
        buying_price: 40,
        selling_price: 70,
        min_threshold: 4
    },
    {
        name: 'Gutter Corner',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 2,
        buying_price: 150,
        selling_price: 220,
        min_threshold: 2
    },
    {
        name: 'Gutter Dropper',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 1,
        buying_price: 180,
        selling_price: 250,
        min_threshold: 2
    },
    {
        name: 'Gutter End Cap',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 1,
        buying_price: 50,
        selling_price: 80,
        min_threshold: 2
    },
    {
        name: 'Cutting Disc 4 1/2"',
        category: 'Hand & Power Tools',
        unit_of_measure: 'pcs',
        stock_quantity: 4,
        buying_price: 80,
        selling_price: 120,
        min_threshold: 5
    },

    // ==========================================
    // SHEET 2: PPR Pipes & Fittings, Masonry
    // ==========================================
    {
        name: 'PPR Socket 1/2" (20mm)',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 70,
        buying_price: 20,
        selling_price: 35,
        min_threshold: 10
    },
    {
        name: 'PPR Socket 3/4" (25mm)',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 40,
        buying_price: 30,
        selling_price: 50,
        min_threshold: 10
    },
    {
        name: 'PPR Socket 1" (32mm)',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 20,
        buying_price: 50,
        selling_price: 80,
        min_threshold: 5
    },
    {
        name: 'PPR Union 1/2"',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 19,
        buying_price: 120,
        selling_price: 180,
        min_threshold: 5
    },
    {
        name: 'PPR Union 3/4"',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 50,
        buying_price: 160,
        selling_price: 240,
        min_threshold: 5
    },
    {
        name: 'PPR Union 1"',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 21,
        buying_price: 220,
        selling_price: 320,
        min_threshold: 5
    },
    {
        name: 'PPR Tee 1/2"',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 5,
        buying_price: 30,
        selling_price: 50,
        min_threshold: 5
    },
    {
        name: 'PPR Tee 3/4"',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 37,
        buying_price: 45,
        selling_price: 70,
        min_threshold: 5
    },
    {
        name: 'PPR Tee 1"',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 16,
        buying_price: 70,
        selling_price: 110,
        min_threshold: 5
    },
    {
        name: 'PPR Elbow 1/2"',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 98,
        buying_price: 25,
        selling_price: 40,
        min_threshold: 10
    },
    {
        name: 'PPR Elbow 3/4"',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 68,
        buying_price: 35,
        selling_price: 60,
        min_threshold: 10
    },
    {
        name: 'PPR Elbow 1"',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 3,
        buying_price: 60,
        selling_price: 90,
        min_threshold: 3
    },
    {
        name: 'PPR Female Elbow 1/2" x 1/2"',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 39,
        buying_price: 120,
        selling_price: 180,
        min_threshold: 5
    },
    {
        name: 'PPR Female Elbow 3/4" x 1/2"',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 5,
        buying_price: 150,
        selling_price: 220,
        min_threshold: 3
    },
    {
        name: 'Manhole Cover 18" x 18"',
        category: 'Building Materials & Cement',
        unit_of_measure: 'pcs',
        stock_quantity: 8,
        buying_price: 1400,
        selling_price: 1800,
        min_threshold: 2
    },
    {
        name: 'Manhole Cover 12" x 12"',
        category: 'Building Materials & Cement',
        unit_of_measure: 'pcs',
        stock_quantity: 5,
        buying_price: 900,
        selling_price: 1200,
        min_threshold: 2
    },
    {
        name: 'Polythene Sheeting 3ft (Roll)',
        category: 'Building Materials & Cement',
        unit_of_measure: 'roll',
        stock_quantity: 2,
        buying_price: 1800,
        selling_price: 2400,
        min_threshold: 1
    },
    {
        name: 'Polythene Sheeting 4ft (Roll)',
        category: 'Building Materials & Cement',
        unit_of_measure: 'roll',
        stock_quantity: 2,
        buying_price: 2400,
        selling_price: 3200,
        min_threshold: 1
    },

    // ==========================================
    // SHEET 3: Fixtures, Electrical & Tools
    // ==========================================
    {
        name: 'Lorenzetti Ducha Ultra Instant Shower',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 4,
        buying_price: 1150,
        selling_price: 1500, // Explicitly marked 1500/= on stock sheet
        min_threshold: 2
    },
    {
        name: 'Magic Connector 4"',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 9,
        buying_price: 250,
        selling_price: 350,
        min_threshold: 3
    },
    {
        name: 'Flushing Handle Plastic',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 10,
        buying_price: 120,
        selling_price: 180,
        min_threshold: 3
    },
    {
        name: 'Flexible Tube 1 1/2 ft',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 4,
        buying_price: 120,
        selling_price: 180,
        min_threshold: 3
    },
    {
        name: 'Flexible Tube 2 ft',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 14,
        buying_price: 150,
        selling_price: 220,
        min_threshold: 4
    },
    {
        name: 'Bottle Trap',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 3,
        buying_price: 350,
        selling_price: 500,
        min_threshold: 2
    },
    {
        name: 'Ball Valve Metallic 3/4"',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 1,
        buying_price: 450,
        selling_price: 650,
        min_threshold: 2
    },
    {
        name: 'Ball Valve Metallic 1/2"',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 1,
        buying_price: 350,
        selling_price: 500,
        min_threshold: 2
    },
    {
        name: 'Pattress Box Single 1-Gang',
        category: 'Electrical & Lighting',
        unit_of_measure: 'pcs',
        stock_quantity: 21,
        buying_price: 30,
        selling_price: 50,
        min_threshold: 5
    },
    {
        name: 'Pattress Box Double 2-Gang',
        category: 'Electrical & Lighting',
        unit_of_measure: 'pcs',
        stock_quantity: 3,
        buying_price: 50,
        selling_price: 80,
        min_threshold: 3
    },
    {
        name: 'Nylon Cable Ties (Pkt)',
        category: 'Electrical & Lighting',
        unit_of_measure: 'pkt',
        stock_quantity: 1,
        buying_price: 180,
        selling_price: 280,
        min_threshold: 2
    },
    {
        name: 'Scissors Files',
        category: 'Hand & Power Tools',
        unit_of_measure: 'pcs',
        stock_quantity: 6,
        buying_price: 80,
        selling_price: 130,
        min_threshold: 2
    },
    {
        name: 'Thoba (Rasp File)',
        category: 'Hand & Power Tools',
        unit_of_measure: 'pcs',
        stock_quantity: 14,
        buying_price: 120,
        selling_price: 180,
        min_threshold: 3
    },
    {
        name: 'Claw Hammer Big',
        category: 'Hand & Power Tools',
        unit_of_measure: 'pcs',
        stock_quantity: 1,
        buying_price: 550,
        selling_price: 750,
        min_threshold: 1
    },
    {
        name: 'Claw Hammer Small',
        category: 'Hand & Power Tools',
        unit_of_measure: 'pcs',
        stock_quantity: 1,
        buying_price: 350,
        selling_price: 500,
        min_threshold: 1
    },
    {
        name: 'Axel Blades (Hacksaw Blades)',
        category: 'Hand & Power Tools',
        unit_of_measure: 'pcs',
        stock_quantity: 17,
        buying_price: 40,
        selling_price: 70,
        min_threshold: 5
    },
    {
        name: 'Open Spanner 16-17mm',
        category: 'Hand & Power Tools',
        unit_of_measure: 'pcs',
        stock_quantity: 2,
        buying_price: 150,
        selling_price: 220,
        min_threshold: 1
    },
    {
        name: 'Open Spanner 10-11mm',
        category: 'Hand & Power Tools',
        unit_of_measure: 'pcs',
        stock_quantity: 1,
        buying_price: 100,
        selling_price: 150,
        min_threshold: 1
    },
    {
        name: 'Combination Spanner 12-13mm',
        category: 'Hand & Power Tools',
        unit_of_measure: 'pcs',
        stock_quantity: 2,
        buying_price: 140,
        selling_price: 200,
        min_threshold: 1
    },
    {
        name: 'Masonry Drill Bit 10mm',
        category: 'Hand & Power Tools',
        unit_of_measure: 'pcs',
        stock_quantity: 5,
        buying_price: 120,
        selling_price: 180,
        min_threshold: 2
    },
    {
        name: 'Masonry Drill Bit 8mm',
        category: 'Hand & Power Tools',
        unit_of_measure: 'pcs',
        stock_quantity: 1,
        buying_price: 90,
        selling_price: 140,
        min_threshold: 2
    },
    {
        name: 'Masonry Drill Bit 6mm',
        category: 'Hand & Power Tools',
        unit_of_measure: 'pcs',
        stock_quantity: 4,
        buying_price: 70,
        selling_price: 110,
        min_threshold: 2
    },
    {
        name: 'Scrapers 3"',
        category: 'Hand & Power Tools',
        unit_of_measure: 'pcs',
        stock_quantity: 3,
        buying_price: 80,
        selling_price: 130,
        min_threshold: 2
    },
    {
        name: 'Spray Pump 16L',
        category: 'Hand & Power Tools',
        unit_of_measure: 'pcs',
        stock_quantity: 2,
        buying_price: 1800,
        selling_price: 2500,
        min_threshold: 1
    },
    {
        name: 'Diamond Cutting Disc 7"',
        category: 'Hand & Power Tools',
        unit_of_measure: 'pcs',
        stock_quantity: 2,
        buying_price: 650,
        selling_price: 900,
        min_threshold: 1
    },
    {
        name: 'Diamond Cutting Disc 4 1/2"',
        category: 'Hand & Power Tools',
        unit_of_measure: 'pcs',
        stock_quantity: 2,
        buying_price: 250,
        selling_price: 380,
        min_threshold: 2
    },

    // ==========================================
    // SHEET 4: Hardware, Tape, Bulbs, Spirits
    // ==========================================
    {
        name: 'Spirit Level 20"',
        category: 'Hand & Power Tools',
        unit_of_measure: 'pcs',
        stock_quantity: 6,
        buying_price: 450,
        selling_price: 650,
        min_threshold: 2
    },
    {
        name: 'Spirit Level 12"',
        category: 'Hand & Power Tools',
        unit_of_measure: 'pcs',
        stock_quantity: 6,
        buying_price: 320,
        selling_price: 480,
        min_threshold: 2
    },
    {
        name: 'Toilet Syphone Mechanism',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 1,
        buying_price: 380,
        selling_price: 550,
        min_threshold: 1
    },
    {
        name: 'Square Ruler',
        category: 'Hand & Power Tools',
        unit_of_measure: 'pcs',
        stock_quantity: 11,
        buying_price: 180,
        selling_price: 260,
        min_threshold: 2
    },
    {
        name: 'Paint Brush 6"',
        category: 'Paints & Finishes',
        unit_of_measure: 'pcs',
        stock_quantity: 4,
        buying_price: 180,
        selling_price: 260,
        min_threshold: 2
    },
    {
        name: 'Paint Brush 3"',
        category: 'Paints & Finishes',
        unit_of_measure: 'pcs',
        stock_quantity: 1,
        buying_price: 90,
        selling_price: 140,
        min_threshold: 2
    },
    {
        name: 'Paint Brush 2"',
        category: 'Paints & Finishes',
        unit_of_measure: 'pcs',
        stock_quantity: 2,
        buying_price: 60,
        selling_price: 100,
        min_threshold: 2
    },
    {
        name: 'Paint Brush 1"',
        category: 'Paints & Finishes',
        unit_of_measure: 'pcs',
        stock_quantity: 5,
        buying_price: 35,
        selling_price: 60,
        min_threshold: 2
    },
    {
        name: 'Masking / Packing Tape Big',
        category: 'General Hardware',
        unit_of_measure: 'pcs',
        stock_quantity: 4,
        buying_price: 100,
        selling_price: 160,
        min_threshold: 2
    },
    {
        name: 'Manila Rope 18-Ply',
        category: 'General Hardware',
        unit_of_measure: 'pcs',
        stock_quantity: 7,
        buying_price: 180,
        selling_price: 260,
        min_threshold: 3
    },
    {
        name: 'Manila Rope 12-Ply',
        category: 'General Hardware',
        unit_of_measure: 'pcs',
        stock_quantity: 28,
        buying_price: 120,
        selling_price: 180,
        min_threshold: 5
    },
    {
        name: 'Plastic Bib Tap',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 28,
        buying_price: 90,
        selling_price: 150,
        min_threshold: 5
    },
    {
        name: 'DP LED Bulb 30W',
        category: 'Electrical & Lighting',
        unit_of_measure: 'pcs',
        stock_quantity: 2,
        buying_price: 380,
        selling_price: 550,
        min_threshold: 2
    },
    {
        name: 'Tommy LED Bulb 9W',
        category: 'Electrical & Lighting',
        unit_of_measure: 'pcs',
        stock_quantity: 3,
        buying_price: 100,
        selling_price: 160,
        min_threshold: 3
    },
    {
        name: 'DP LED Bulb 9W',
        category: 'Electrical & Lighting',
        unit_of_measure: 'pcs',
        stock_quantity: 2,
        buying_price: 110,
        selling_price: 170,
        min_threshold: 3
    },
    {
        name: 'White Spirit 1 Litre',
        category: 'Paints & Finishes',
        unit_of_measure: 'bottle',
        stock_quantity: 4,
        buying_price: 150,
        selling_price: 220,
        min_threshold: 2
    },
    {
        name: 'White Spirit 1/2 Litre',
        category: 'Paints & Finishes',
        unit_of_measure: 'bottle',
        stock_quantity: 9,
        buying_price: 90,
        selling_price: 140,
        min_threshold: 3
    },
    {
        name: 'Voltage Tester Screwdriver',
        category: 'Hand & Power Tools',
        unit_of_measure: 'pcs',
        stock_quantity: 4,
        buying_price: 70,
        selling_price: 120,
        min_threshold: 2
    },
    {
        name: 'Toilet Rubber Washer',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 11,
        buying_price: 20,
        selling_price: 40,
        min_threshold: 5
    },
    {
        name: 'Turpentine 1 Litre',
        category: 'Paints & Finishes',
        unit_of_measure: 'bottle',
        stock_quantity: 1,
        buying_price: 160,
        selling_price: 230,
        min_threshold: 1
    },
    {
        name: 'Measuring Tape 5m',
        category: 'Hand & Power Tools',
        unit_of_measure: 'pcs',
        stock_quantity: 10,
        buying_price: 180,
        selling_price: 270,
        min_threshold: 3
    },
    {
        name: 'Measuring Tape 7.5m',
        category: 'Hand & Power Tools',
        unit_of_measure: 'pcs',
        stock_quantity: 1,
        buying_price: 280,
        selling_price: 400,
        min_threshold: 1
    },
    {
        name: 'Enerbras Instant Shower',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 1,
        buying_price: 1400,
        selling_price: 1900,
        min_threshold: 1
    },
    {
        name: 'Ball Tap (Float Valve)',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 2,
        buying_price: 350,
        selling_price: 500,
        min_threshold: 2
    },
    {
        name: 'Cable Clips 12mm',
        category: 'Electrical & Lighting',
        unit_of_measure: 'pkt',
        stock_quantity: 11,
        buying_price: 60,
        selling_price: 100,
        min_threshold: 3
    },
    {
        name: 'Cable Clips 10mm',
        category: 'Electrical & Lighting',
        unit_of_measure: 'pkt',
        stock_quantity: 13,
        buying_price: 55,
        selling_price: 90,
        min_threshold: 3
    },
    {
        name: 'Cable Clips 9mm',
        category: 'Electrical & Lighting',
        unit_of_measure: 'pkt',
        stock_quantity: 10,
        buying_price: 50,
        selling_price: 80,
        min_threshold: 3
    },
    {
        name: 'Tangit PVC Solvent Cement 500ml',
        category: 'Paints & Finishes',
        unit_of_measure: 'tin',
        stock_quantity: 1,
        buying_price: 620,
        selling_price: 850,
        min_threshold: 1
    },
    {
        name: 'Tangit PVC Solvent Cement 250ml',
        category: 'Paints & Finishes',
        unit_of_measure: 'tin',
        stock_quantity: 6,
        buying_price: 350,
        selling_price: 500,
        min_threshold: 2
    },
    {
        name: 'Tangit PVC Solvent Cement 50ml',
        category: 'Paints & Finishes',
        unit_of_measure: 'tube',
        stock_quantity: 14,
        buying_price: 110,
        selling_price: 160,
        min_threshold: 5
    },

    // ==========================================
    // SHEET 5: Spray Paint, Padlocks, Valves
    // ==========================================
    {
        name: 'Spray Paint Bright Gold 400ml',
        category: 'Paints & Finishes',
        unit_of_measure: 'can',
        stock_quantity: 1,
        buying_price: 250,
        selling_price: 380,
        min_threshold: 1
    },
    {
        name: 'Spray Paint Matt Black 400ml',
        category: 'Paints & Finishes',
        unit_of_measure: 'can',
        stock_quantity: 1,
        buying_price: 250,
        selling_price: 380,
        min_threshold: 1
    },
    {
        name: 'Spray Paint Silver Grey 400ml',
        category: 'Paints & Finishes',
        unit_of_measure: 'can',
        stock_quantity: 2,
        buying_price: 250,
        selling_price: 380,
        min_threshold: 1
    },
    {
        name: 'Spray Paint Blue 400ml',
        category: 'Paints & Finishes',
        unit_of_measure: 'can',
        stock_quantity: 1,
        buying_price: 250,
        selling_price: 380,
        min_threshold: 1
    },
    {
        name: 'Shoe / Wire Tacks 1"',
        category: 'Fasteners, Nails & Screws',
        unit_of_measure: 'pkt',
        stock_quantity: 1,
        buying_price: 80,
        selling_price: 130,
        min_threshold: 2
    },
    {
        name: 'Soap Dish Plastic',
        category: 'General Hardware',
        unit_of_measure: 'pcs',
        stock_quantity: 3,
        buying_price: 120,
        selling_price: 180,
        min_threshold: 2
    },
    {
        name: 'Tissue Holder Plastic',
        category: 'General Hardware',
        unit_of_measure: 'pcs',
        stock_quantity: 3,
        buying_price: 180,
        selling_price: 260,
        min_threshold: 2
    },
    {
        name: 'Cistern Flush Handle Metallic',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 3,
        buying_price: 150,
        selling_price: 220,
        min_threshold: 2
    },
    {
        name: 'Door / Cabinet Handles',
        category: 'General Hardware',
        unit_of_measure: 'pcs',
        stock_quantity: 30,
        buying_price: 80,
        selling_price: 130,
        min_threshold: 5
    },
    {
        name: 'Engineer Files Large 250mm',
        category: 'Hand & Power Tools',
        unit_of_measure: 'pcs',
        stock_quantity: 1,
        buying_price: 220,
        selling_price: 320,
        min_threshold: 1
    },
    {
        name: 'Engineer Files Small 150mm',
        category: 'Hand & Power Tools',
        unit_of_measure: 'pcs',
        stock_quantity: 4,
        buying_price: 140,
        selling_price: 200,
        min_threshold: 2
    },
    {
        name: 'Tricycle Padlock Small',
        category: 'General Hardware',
        unit_of_measure: 'pcs',
        stock_quantity: 6,
        buying_price: 120,
        selling_price: 180,
        min_threshold: 2
    },
    {
        name: 'Sanitary Fixing Bolt Set',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pkt',
        stock_quantity: 5,
        buying_price: 100,
        selling_price: 160,
        min_threshold: 2
    },
    {
        name: 'Padlock Dikas Heavy Duty',
        category: 'General Hardware',
        unit_of_measure: 'pcs',
        stock_quantity: 5,
        buying_price: 220,
        selling_price: 320,
        min_threshold: 2
    },
    {
        name: 'Padlock Robinson',
        category: 'General Hardware',
        unit_of_measure: 'pcs',
        stock_quantity: 1,
        buying_price: 280,
        selling_price: 400,
        min_threshold: 1
    },
    {
        name: 'Padlock Audly Chrome',
        category: 'General Hardware',
        unit_of_measure: 'pcs',
        stock_quantity: 3,
        buying_price: 300,
        selling_price: 450,
        min_threshold: 2
    },
    {
        name: 'Padlock Mindy Top Security',
        category: 'General Hardware',
        unit_of_measure: 'pcs',
        stock_quantity: 4,
        buying_price: 350,
        selling_price: 500,
        min_threshold: 2
    },
    {
        name: 'Padlock Solte',
        category: 'General Hardware',
        unit_of_measure: 'pcs',
        stock_quantity: 2,
        buying_price: 250,
        selling_price: 380,
        min_threshold: 1
    },
    {
        name: 'Padlock Audly Brass',
        category: 'General Hardware',
        unit_of_measure: 'pcs',
        stock_quantity: 1,
        buying_price: 260,
        selling_price: 380,
        min_threshold: 1
    },
    {
        name: 'Shower Head Chrome',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 2,
        buying_price: 180,
        selling_price: 280,
        min_threshold: 2
    },
    {
        name: 'Jigsaw Blades Set',
        category: 'Hand & Power Tools',
        unit_of_measure: 'pcs',
        stock_quantity: 2,
        buying_price: 80,
        selling_price: 130,
        min_threshold: 2
    },
    {
        name: 'Screwdriver Bit Set',
        category: 'Hand & Power Tools',
        unit_of_measure: 'pcs',
        stock_quantity: 13,
        buying_price: 150,
        selling_price: 220,
        min_threshold: 3
    },
    {
        name: 'Bulb Holder Batten/Pendant',
        category: 'Electrical & Lighting',
        unit_of_measure: 'pcs',
        stock_quantity: 9,
        buying_price: 50,
        selling_price: 90,
        min_threshold: 3
    },
    {
        name: 'Ball Tap Lever Valve',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 4,
        buying_price: 380,
        selling_price: 550,
        min_threshold: 2
    },
    {
        name: 'Concealed Stop Cock',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 2,
        buying_price: 450,
        selling_price: 650,
        min_threshold: 2
    },
    {
        name: 'Wall Tap Star Handle',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 2,
        buying_price: 350,
        selling_price: 500,
        min_threshold: 2
    },
    {
        name: 'Pillar Tap Chrome',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 5,
        buying_price: 400,
        selling_price: 600,
        min_threshold: 2
    },
    {
        name: 'Gate Valve 1/2"',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 5,
        buying_price: 380,
        selling_price: 550,
        min_threshold: 2
    },
    {
        name: 'Gate Valve 3/4"',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 2,
        buying_price: 520,
        selling_price: 750,
        min_threshold: 2
    },
    {
        name: 'Gate Valve 1"',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 1,
        buying_price: 750,
        selling_price: 1100,
        min_threshold: 1
    },
    {
        name: 'Gate Valve 1 1/4"',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 2,
        buying_price: 1100,
        selling_price: 1600,
        min_threshold: 1
    },
    {
        name: 'Handsaw 18"',
        category: 'Hand & Power Tools',
        unit_of_measure: 'pcs',
        stock_quantity: 1,
        buying_price: 450,
        selling_price: 650,
        min_threshold: 1
    },
    {
        name: 'Circuit Breaker C20 Single Pole',
        category: 'Electrical & Lighting',
        unit_of_measure: 'pcs',
        stock_quantity: 12,
        buying_price: 220,
        selling_price: 320,
        min_threshold: 3
    },
    {
        name: 'Circuit Breaker C32 Single Pole',
        category: 'Electrical & Lighting',
        unit_of_measure: 'pcs',
        stock_quantity: 11,
        buying_price: 220,
        selling_price: 320,
        min_threshold: 3
    },

    // ==========================================
    // SHEET 6: Switches, Finishes, Grout
    // ==========================================
    {
        name: 'Switch Single 1-Gang',
        category: 'Electrical & Lighting',
        unit_of_measure: 'pcs',
        stock_quantity: 4,
        buying_price: 90,
        selling_price: 150,
        min_threshold: 3
    },
    {
        name: 'Switch Double 2-Gang',
        category: 'Electrical & Lighting',
        unit_of_measure: 'pcs',
        stock_quantity: 5,
        buying_price: 140,
        selling_price: 220,
        min_threshold: 3
    },
    {
        name: 'Cooker Control Switch 45A',
        category: 'Electrical & Lighting',
        unit_of_measure: 'pcs',
        stock_quantity: 2,
        buying_price: 450,
        selling_price: 650,
        min_threshold: 1
    },
    {
        name: 'Socket Single 13A',
        category: 'Electrical & Lighting',
        unit_of_measure: 'pcs',
        stock_quantity: 13,
        buying_price: 110,
        selling_price: 180,
        min_threshold: 4
    },
    {
        name: 'Wood Varnish Clear 1/2L',
        category: 'Paints & Finishes',
        unit_of_measure: 'tin',
        stock_quantity: 6,
        buying_price: 280,
        selling_price: 400,
        min_threshold: 2
    },
    {
        name: 'Wood Varnish Mahogany 1/2L',
        category: 'Paints & Finishes',
        unit_of_measure: 'tin',
        stock_quantity: 10,
        buying_price: 280,
        selling_price: 400,
        min_threshold: 2
    },
    {
        name: 'Wood Varnish Clear 1/4L',
        category: 'Paints & Finishes',
        unit_of_measure: 'tin',
        stock_quantity: 6,
        buying_price: 160,
        selling_price: 240,
        min_threshold: 2
    },
    {
        name: 'Wood Varnish Mahogany 1/4L',
        category: 'Paints & Finishes',
        unit_of_measure: 'tin',
        stock_quantity: 2,
        buying_price: 160,
        selling_price: 240,
        min_threshold: 2
    },
    {
        name: 'Tile Grout 1kg',
        category: 'Paints & Finishes',
        unit_of_measure: 'pkt',
        stock_quantity: 8,
        buying_price: 80,
        selling_price: 120,
        min_threshold: 3
    },
    {
        name: 'Waterproof Cement Additive 1kg',
        category: 'Paints & Finishes',
        unit_of_measure: 'pkt',
        stock_quantity: 2,
        buying_price: 180,
        selling_price: 260,
        min_threshold: 2
    },
    {
        name: 'Hex Allen Key Set',
        category: 'Hand & Power Tools',
        unit_of_measure: 'pkt',
        stock_quantity: 3,
        buying_price: 180,
        selling_price: 270,
        min_threshold: 2
    },
    {
        name: 'Magic Connector Plastic 1 1/2"',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 13,
        buying_price: 150,
        selling_price: 220,
        min_threshold: 3
    },
    {
        name: 'Magic Connector Plastic 1 1/4"',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 6,
        buying_price: 140,
        selling_price: 200,
        min_threshold: 3
    },
    {
        name: 'Angle Valve 1/2"',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 19,
        buying_price: 220,
        selling_price: 320,
        min_threshold: 5
    },
    {
        name: 'Stop Cock 1/2"',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 2,
        buying_price: 250,
        selling_price: 360,
        min_threshold: 2
    },

    // ==========================================
    // SHEET 7: Thread Tape, PPR Concealed, Steel Nails
    // ==========================================
    {
        name: 'Thread Tape Big',
        category: 'General Hardware',
        unit_of_measure: 'pkt',
        stock_quantity: 1,
        buying_price: 250,
        selling_price: 400,
        min_threshold: 1
    },
    {
        name: 'PPR Concealed Valve 20mm (1/2")',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 9,
        buying_price: 450,
        selling_price: 650,
        min_threshold: 2
    },
    {
        name: 'PPR Concealed Valve 25mm (3/4")',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 10,
        buying_price: 580,
        selling_price: 850,
        min_threshold: 2
    },
    {
        name: 'Cistern Top Flush Mechanism',
        category: 'Plumbing & Pipes',
        unit_of_measure: 'pcs',
        stock_quantity: 6,
        buying_price: 450,
        selling_price: 650,
        min_threshold: 2
    },
    {
        name: 'Steel Nails 1"',
        category: 'Fasteners, Nails & Screws',
        unit_of_measure: 'pkt',
        stock_quantity: 3,
        buying_price: 130,
        selling_price: 180,
        min_threshold: 2
    },
    {
        name: 'Steel Nails 1 1/2"',
        category: 'Fasteners, Nails & Screws',
        unit_of_measure: 'pkt',
        stock_quantity: 2,
        buying_price: 130,
        selling_price: 180,
        min_threshold: 2
    },
    {
        name: 'Steel Nails 2"',
        category: 'Fasteners, Nails & Screws',
        unit_of_measure: 'pkt',
        stock_quantity: 10,
        buying_price: 130,
        selling_price: 180,
        min_threshold: 3
    },
    {
        name: 'Steel Nails 2 1/2"',
        category: 'Fasteners, Nails & Screws',
        unit_of_measure: 'pkt',
        stock_quantity: 9,
        buying_price: 130,
        selling_price: 180,
        min_threshold: 3
    },
    {
        name: 'Steel Nails 3"',
        category: 'Fasteners, Nails & Screws',
        unit_of_measure: 'pkt',
        stock_quantity: 12,
        buying_price: 130,
        selling_price: 180,
        min_threshold: 3
    },
    {
        name: 'Steel Nails 4"',
        category: 'Fasteners, Nails & Screws',
        unit_of_measure: 'pkt',
        stock_quantity: 6,
        buying_price: 130,
        selling_price: 180,
        min_threshold: 2
    }
];

async function run() {
    console.log('🚀 Starting Physical Stock Check Ingestion...');

    // 1. Fetch current inventory to see what already exists
    const { data: existing, error: fetchErr } = await supabase
        .from('inventory')
        .select('*');

    if (fetchErr) {
        console.error('❌ Failed to fetch existing inventory:', fetchErr);
        process.exit(1);
    }

    console.log(`📦 Currently found ${existing.length} items in Supabase.`);

    // 2. Update existing Thread Tape Pack and Loose pcs
    // Existing Thread tape (Pack) -> stock 21
    // Existing Thread tape (1 pice) -> stock 6
    const threadPack = existing.find(i => i.name.toLowerCase().includes('thread tape') && i.name.toLowerCase().includes('pack'));
    if (threadPack) {
        console.log(`🔄 Updating existing Thread Tape Pack (ID: ${threadPack.id}) to stock = 21...`);
        const { error: updErr } = await supabase
            .from('inventory')
            .update({ stock_quantity: 21, updated_at: new Date().toISOString() })
            .eq('id', threadPack.id);
        if (updErr) console.error('Error updating thread tape pack:', updErr);
        else console.log('✅ Thread Tape (Pack) updated to 21 pkts.');
    }

    const threadPcs = existing.find(i => i.name.toLowerCase().includes('thread tape') && (i.name.toLowerCase().includes('pice') || i.name.toLowerCase().includes('piece')));
    if (threadPcs) {
        console.log(`🔄 Updating existing Thread Tape Pcs (ID: ${threadPcs.id}) to stock = 6...`);
        const { error: updErr } = await supabase
            .from('inventory')
            .update({ stock_quantity: 6, updated_at: new Date().toISOString() })
            .eq('id', threadPcs.id);
        if (updErr) console.error('Error updating thread tape pcs:', updErr);
        else console.log('✅ Thread Tape (1 pice) updated to 6 pcs.');
    }

    // 3. Process the Audited Items
    let insertedCount = 0;
    let updatedCount = 0;
    let errorCount = 0;

    for (const item of AUDITED_ITEMS) {
        // Check if an item with the same name already exists
        const matched = existing.find(e => e.name.trim().toLowerCase() === item.name.trim().toLowerCase());

        if (matched) {
            console.log(`ℹ️ Item already exists: "${matched.name}". Updating stock to ${item.stock_quantity}...`);
            const { error: updErr } = await supabase
                .from('inventory')
                .update({
                    stock_quantity: item.stock_quantity,
                    buying_price: item.buying_price,
                    selling_price: item.selling_price,
                    unit_of_measure: item.unit_of_measure,
                    category: item.category,
                    min_threshold: item.min_threshold,
                    updated_at: new Date().toISOString()
                })
                .eq('id', matched.id);

            if (updErr) {
                console.error(`❌ Error updating "${item.name}":`, updErr.message);
                errorCount++;
            } else {
                updatedCount++;
            }
        } else {
            // Insert new item
            const payload = {
                name: item.name,
                category: item.category,
                unit_of_measure: item.unit_of_measure,
                stock_quantity: item.stock_quantity,
                buying_price: item.buying_price,
                selling_price: item.selling_price,
                min_threshold: item.min_threshold,
                is_quick_add: false,
                is_active: true,
                is_service: false,
                is_kyocera: false,
                type: 'fixed',
                parent_id: null,
                units_per_parent: 1,
                tier_level: 1
            };

            const { error: insErr } = await supabase
                .from('inventory')
                .insert([payload]);

            if (insErr) {
                console.error(`❌ Error inserting "${item.name}":`, insErr.message);
                errorCount++;
            } else {
                insertedCount++;
            }
        }
    }

    console.log(`\n==============================================`);
    console.log(`🎉 Ingestion Complete!`);
    console.log(`   - Inserted new items: ${insertedCount}`);
    console.log(`   - Updated items:      ${updatedCount}`);
    console.log(`   - Errors encountered: ${errorCount}`);
    console.log(`==============================================\n`);

    // 4. Verification assertion
    const { data: finalInventory, error: finalErr } = await supabase
        .from('inventory')
        .select('id, name, category, stock_quantity, selling_price, buying_price, profit_margin')
        .order('category', { ascending: true })
        .order('name', { ascending: true });

    if (finalErr) {
        console.error('❌ Failed to query final inventory:', finalErr);
        process.exit(1);
    }

    console.log(`📊 Total items in database now: ${finalInventory.length}`);
    
    // Group by category and print counts
    const byCategory = {};
    let totalStockPcs = 0;
    let totalValuation = 0;

    for (const item of finalInventory) {
        byCategory[item.category] = (byCategory[item.category] || 0) + 1;
        totalStockPcs += Number(item.stock_quantity || 0);
        totalValuation += Number(item.stock_quantity || 0) * Number(item.buying_price || 0);
    }

    console.log('\n📋 Breakdown by Category:');
    for (const [cat, count] of Object.entries(byCategory)) {
        console.log(`   - ${cat.padEnd(30)} : ${count} items`);
    }
    console.log(`\n💰 Total Stock Items: ${totalStockPcs} units`);
    console.log(`💵 Total Inventory Valuation (at cost): KSh ${totalValuation.toLocaleString()}`);
}

run().catch(console.error);
