const SECRET_PATTERNS=[
  /API_KEY/i,/TOKEN/i,/SECRET/i,/PASSWORD/i,/PRIVATE_KEY/i,/CREDENTIAL/i
];

export function requiredSecrets(env=process.env,names=[]) {
  const missing=names.filter(name=>!env[name]);
  if(missing.length) throw new Error("Missing required secrets: "+missing.join(", "));
  return Object.fromEntries(names.map(name=>[name,env[name]]));
}

export function redactSecrets(value,secrets=[]) {
  let text=typeof value==="string"?value:JSON.stringify(value);
  for(const secret of secrets.filter(Boolean)) {
    if(secret.length>=4) text=text.split(secret).join("[REDACTED]");
  }
  return typeof value==="string"?text:JSON.parse(text);
}

export function isSecretName(name) {
  return SECRET_PATTERNS.some(pattern=>pattern.test(name));
}
