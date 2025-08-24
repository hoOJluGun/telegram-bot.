module.exports = function validateDomain(domain){
  return /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9](?:\.[a-z]{2,})+$/i.test(domain||"");
};