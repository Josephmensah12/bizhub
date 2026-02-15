/**
 * One-time fix: Correct asset categories assigned during SalesBinder migration.
 *
 * Usage: node scripts/fix-asset-categories.js
 */

const { sequelize } = require('../models')
const { QueryTypes } = require('sequelize')

function info(...args) { console.log(`[INFO]`, ...args) }

const RULES = [
  // Laptops — match on make OR model containing HP laptop brand names
  {
    where: `LOWER(make) LIKE '%elitebook%' OR LOWER(make) LIKE '%probook%' OR LOWER(make) LIKE '%zbook%' OR LOWER(make) LIKE '%eb x360%' OR LOWER(model) LIKE '%elitebook%' OR LOWER(model) LIKE '%probook%' OR LOWER(model) LIKE '%zbook%' OR LOWER(model) LIKE '%eb x360%' OR LOWER(model) LIKE '%pavilion%' OR LOWER(model) LIKE '%envy%' OR LOWER(model) LIKE '%spectre%' OR LOWER(model) LIKE '%omen%' OR LOWER(model) LIKE '%victus%'`,
    category: 'Computer', asset_type: 'Laptop'
  },
  // Laptops — HP as make with generic model (catch-all for HP branded items that look like laptops)
  {
    where: `LOWER(make) = 'hp' AND LOWER(model) NOT LIKE '%monitor%' AND LOWER(model) NOT LIKE '%printer%' AND LOWER(model) NOT LIKE '%speaker%'`,
    category: 'Computer', asset_type: 'Laptop'
  },
  // Laptops — Dell
  {
    where: `LOWER(make) LIKE '%dell%' OR LOWER(model) LIKE '%latitude%' OR LOWER(model) LIKE '%inspiron%' OR LOWER(model) LIKE '%xps%' OR LOWER(model) LIKE '%vostro%' OR LOWER(model) LIKE '%precision%'`,
    category: 'Computer', asset_type: 'Laptop'
  },
  // Laptops — Lenovo
  {
    where: `LOWER(make) LIKE '%lenovo%' OR LOWER(model) LIKE '%thinkpad%' OR LOWER(model) LIKE '%ideapad%' OR LOWER(model) LIKE '%yoga%' OR LOWER(model) LIKE '%legion%'`,
    category: 'Computer', asset_type: 'Laptop'
  },
  // Laptops — generic laptop keywords
  {
    where: `LOWER(model) LIKE '%laptop%' OR LOWER(model) LIKE '%notebook%'`,
    category: 'Computer', asset_type: 'Laptop'
  },
  // MacBooks
  {
    where: `LOWER(model) LIKE '%macbook%' OR LOWER(make) LIKE '%macbook%' OR (LOWER(make) LIKE '%apple%' AND LOWER(model) LIKE '%mac%')`,
    category: 'Computer', asset_type: 'MacBook'
  },
  // Microsoft Surface → Tablet
  {
    where: `LOWER(make) LIKE '%microsoft%' OR LOWER(model) LIKE '%surface%'`,
    category: 'Computer', asset_type: 'Tablet'
  },
  // Audio — JBL, Beats, AirPod, Soundbar, ION, Boombox
  {
    where: `LOWER(make) LIKE '%jbl%' OR LOWER(model) LIKE '%jbl%' OR LOWER(make) LIKE '%ion%' OR LOWER(model) LIKE '%beats%' OR LOWER(model) LIKE '%airpod%' OR LOWER(model) LIKE '%soundbar%' OR LOWER(model) LIKE '%boombox%' OR LOWER(model) LIKE '%pathfinder%' OR LOWER(model) LIKE '%audio%'`,
    category: 'Consumer Electronics', asset_type: 'Audio Equipment'
  },
  // Samsung soundbar (HW- prefix = soundbar)
  {
    where: `LOWER(make) LIKE '%samsung%' AND LOWER(model) LIKE 'hw-%'`,
    category: 'Consumer Electronics', asset_type: 'Audio Equipment'
  },
  // Sony soundbar
  {
    where: `LOWER(make) LIKE '%sony%' AND (LOWER(model) LIKE '%soundbar%' OR LOWER(model) LIKE '%ht-%')`,
    category: 'Consumer Electronics', asset_type: 'Audio Equipment'
  },
  // Television
  {
    where: `LOWER(model) LIKE '%tv%' OR LOWER(model) LIKE '%television%' OR ((LOWER(make) LIKE '%samsung%' OR LOWER(make) LIKE '%lg%' OR LOWER(make) LIKE '%tcl%' OR LOWER(make) LIKE '%hisense%' OR LOWER(make) LIKE '%sony%') AND (LOWER(model) LIKE '%inch%' OR LOWER(model) LIKE '%smart%' OR LOWER(model) LIKE '%led%' OR LOWER(model) LIKE '%oled%' OR LOWER(model) LIKE '%qled%'))`,
    category: 'Consumer Electronics', asset_type: 'Television'
  },
  // Monitors
  {
    where: `LOWER(model) LIKE '%monitor%' OR LOWER(model) LIKE '%display%'`,
    category: 'Computer', asset_type: 'Monitor'
  },
]

async function run() {
  info('Starting asset category fix...')

  let totalUpdated = 0

  for (const rule of RULES) {
    // Only update assets that currently have the wrong category/type
    const sql = `
      UPDATE assets
      SET category = :category, asset_type = :asset_type, updated_at = NOW()
      WHERE (category != :category OR asset_type != :asset_type)
        AND (${rule.where})
    `

    const [, meta] = await sequelize.query(sql, {
      replacements: { category: rule.category, asset_type: rule.asset_type },
      type: QueryTypes.RAW
    })

    const count = meta?.rowCount || 0
    if (count > 0) {
      info(`Updated ${count} assets → ${rule.category} / ${rule.asset_type}`)
      totalUpdated += count
    }
  }

  info(`Done. Total assets updated: ${totalUpdated}`)
}

run()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fix failed:', err)
    process.exit(1)
  })
