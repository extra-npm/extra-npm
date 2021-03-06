#!/usr/bin/env node
// Views registry info about a package.
const kleur = require('kleur');
const got = require('got');
const validateNpmPackageName = require('validate-npm-package-name');
const boolean = require('extra-boolean').parse;
const cpExec = require('./_cpExec');

const E = process.env;
const URL = 'https://www.npmjs.com/search?q=';
const HEADERS = {
  'x-spiferack': 1
};
const FUNCTION = new Map([
  ['scope',       scope],
  ['date',        date],
  ['publisher',   publisher],
  ['maintainers', maintainers],
  ['score',       score],
  ['stars',       stars],
  ['versions',    versions],
  ['contents',    contents],
  ['readme',      readme],
  ['dependents',  dependents],
  ['downloads',   downloads],
  ['available',   available]
]);
const OPTIONS = {
  package:  null,
  fields:   null,
  name:     null,
  field:    null,
  silent:   boolean(E['NPM_SILENT']||'0')
};




// Log error message.
function error(err, o) {
  if (o.silent) console.log(-1);
  else console.error(kleur.red('error:'), err.message);
}


// Log output value.
function log(val, o) {
  if (o.field.startsWith('#')) {
    if (Array.isArray(val)) val = val.length;
    else if (typeof val==='string') val = val.length;
    else if (typeof val==='object') val = Object.keys(val).length;
  }
  if (Array.isArray(val)) {
    if (o.name) console.log(kleur.green(o.field+' ='));
    for (var v of val) console.log(v);
  }
  else {
    if (o.name) console.log(kleur.green(o.field+' ='), val);
    else console.log(val);
  }
}




// Get package name, with validation.
function package(nam, o) {
  nam = nam.replace(/(.)@.*/, '$1');
  var a = validateNpmPackageName(nam);
  if (a.validForNewPackages || a.validForOldPackages) return nam;
  if (o.silent) return console.log(-1);
  for (var m of a.errors||[])
    console.error(kleur.red('error:'), m);
  for (var m of a.warnings||[])
    console.warn(kleur.yellow('warning:'), m);
}


// Get package details.
async function details(nam, o) {
  try {
    var a = JSON.parse((await got(URL+nam, {headers: HEADERS})).body);
    if (a.ghapi) a = JSON.parse((await got(URL+nam+'*', {headers: HEADERS})).body);
    for (var d of a.objects)
      if (d.package.name===nam) return d;
    throw new Error('cannot find package '+nam);
  }
  catch (e) { error(e, o); }
}


// Get scope of package.
function scope(pkg, o) {
  if ((pkg=package(pkg, o))==null) return;
  if (!pkg.startsWith('@')) log('unscoped', o);
  else log(pkg.substring(1).replace(/\/.*/, ''), o);
}


// Get last publish date of package.
async function date(pkg, o) {
  var d = null;
  if ((pkg=package(pkg, o))==null) return;
  if ((d=await details(pkg, o))==null) return;
  log(o.field.includes('date.rel')? d.package.date.rel:d.package.date.ts, o);
}


// Get publisher of package.
async function publisher(pkg, o) {
  var d = null;
  if ((pkg=package(pkg, o))==null) return;
  if ((d=await details(pkg, o))==null) return;
  log(d.package.publisher.name, o);
}


// Get maintainers of package.
async function maintainers(pkg, o) {
  var d = null;
  if ((pkg=package(pkg, o))==null) return;
  if ((d=await details(pkg, o))==null) return;
  if (o.count) return log(d.package.maintainers.length, o);
  if (o.field.includes('maintainers.username')) log(d.package.maintainers.map(m => m.username), o);
  else if (o.field.includes('maintainers.email')) log(d.package.maintainers.map(m => m.email), o);
  else log(d.package.maintainers.map(m => `${m.username} (${m.email})`), o);
}


// Get score of package.
async function score(pkg, o) {
  var d = null;
  if ((pkg=package(pkg, o))==null) return;
  if ((d=await details(pkg, o))==null) return;
  if (o.field.includes('score.quality')) log(d.score.detail.quality, o);
  else if (o.field.includes('score.popularity')) log(d.score.detail.popularity, o);
  else if (o.field.includes('score.maintenance')) log(d.score.detail.maintenance, o);
  else log(d.score.final, o);
}


// Get stars of package.
async function stars(pkg, o) {
  if ((pkg=package(pkg, o))==null) return;
  try { log(await npmPackageStars(pkg), o); }
  catch (e) { error(e, o); }
}


// Get versions of package.
function versions(pkg, o) {
  if ((pkg=package(pkg, o))==null) return;
  npmPackageVersions(pkg, (e, vers) => {
    if (e) return error(e, o);
    log(vers, o);
  });
}


// Get contents of package.
async function contents(pkg, o) {
  var nam = pkg.replace(/(.)@.*/, '$1');
  var ver = pkg.indexOf('@')>0? pkg.replace(/(.).*?@/, ''):null;
  try { log(await listNpmContents(nam, ver), o); }
  catch (e) { error(e, o); }
}


// Get readme of package.
async function readme(pkg, o) {
  var nam = pkg.replace(/(.)@.*/, '$1'), fil = null;
  var ver = pkg.indexOf('@')>0? pkg.replace(/(.).*?@/, ''):null;
  try {
    for (var f of (await listNpmContents(nam, ver)))
      if (/^readme(\..+)?/i.test(f)) { fil = f; break; }
    if (fil==null) throw new Error(pkg+' has no readme');
    log([(await got(`https://unpkg.com/${pkg}/${fil}`)).body], o);
  }
  catch (e) { error(e, o); }
}


// Get dependents of package.
function dependents(pkg, o) {
  if ((pkg=package(pkg, o))==null) return;
  var deps = [], req = moduleDependents(pkg)
  req.on('error', e => error(e, o))
  req.on('data', p => deps.push(p.name));
  req.on('end', () => log(deps, o));
}


// Get downloads of package.
async function downloads(pkg, o) {
  if ((pkg=package(pkg, o))==null) return;
  var period = o.field.split('.')[1]||'month';
  try { log(await pkgDownloads(pkg, {period}), o); }
  catch (e) { error(e, o); }
}


// Check if package name is available.
function available(pkg, o) {
  if ((pkg=package(pkg, o))==null) return;
  npmAvailable(pkg, (e, ok) => {
    if (e) return error(e, o);
    log(ok, o);
  });
}


// Get infomation on a package.
async function view(pkg, flds, o) {
  var o = Object.assign({}, OPTIONS, o);
  var fbas = [], fspc = [];
  o.name = flds.length>1;
  for (var f of flds) {
    if (pkg==='.' || !FUNCTION.has(f.replace(/^#/, '').replace(/\..*/, ''))) fbas.push(f);
    else fspc.push(f);
  }
  if (flds.length===0 || fbas.length>0) cpExec('npm view '+pkg+' '+fbas.join(' '));
  for (var f of fspc) {
    var fn = FUNCTION.get(f.replace(/^#/, '').replace(/\..*/, ''));
    if (fn!=null) fn(pkg, Object.assign({}, o, {field: f}));
  }
}
module.exports = view;




// Get options from arguments.
function options(o, k, a, i) {
  o.fields = o.fields||[];
  if (k==='--silent') o.silent = true;
  else if (!o.package)  o.package = a[i];
  else o.fields.push(a[i]);
  return i+1;
}

// Run on shell.
function shell(a) {
  var o = {};
  for (var i=2, I=a.length; i<I;)
    i = options(o, a[i], a, i);
  view(o.package, o.fields, o);
}
if (require.main===module) shell(process.argv);
