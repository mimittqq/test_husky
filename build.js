const {
  job_name,
  user: jenkins_user,
  password: jenkins_password,
  host: jenkins_host,
  crumb_is_user,
  environment: build_env,
} = require('./cfg');
const prompt = require('prompt');
const jenkins = require('jenkins')({
  baseUrl: `http://${jenkins_user}:${jenkins_password}@${jenkins_host}`,
  crumbIssuer: crumb_is_user,
  promisify: true,
});
const colors = require("colors/safe");

prompt.message = '';

const env_reg = new RegExp(`^((${build_env.join('|')})|\\d+)$`);

const schema = {
  properties: {
    environment: {
      pattern: env_reg,
      message: '输入环境名不在配置中, 请查验后重新输入',
      description: `${colors.white('构建环境')}` + `(可输入名字/序号)\n` +
        colors.yellow(`${build_env.map((item, idx) => `${idx+1}.${item}`).join(' / ')}`),
      required: true,
      conform: (value) => {
        if (!isNaN(+value) && (+value > build_env.length || +value < 1)) {
          return false;
        }
        return true;
      }
    },
    branch: {
      required: true,
      description: `${colors.white('构建分支')}`,
    }
  }
};
prompt.start();
prompt.get(schema, function (err, result) {
  if (result) {
    const {
      environment,
      branch
    } = result;
    build_jenkins_task(isNaN(+environment) ? environment : build_env[environment - 1], branch);
  }
});

async function build_jenkins_task(environment, branch) {
  const queue_id = await jenkins.job.build(
    {
      name: job_name,
      parameters: {
        environment,
        branch,
      }
    }
  );
  const check_is_building = new Promise((resolve) => {
    const timer = setInterval(async () => {
      const queue_info = await jenkins.queue.item(queue_id);
      if (queue_info.executable) {
        clearInterval(timer);
        resolve(queue_info.executable.number);
      }
    }, 2000)
  })
  const build_number = await check_is_building;
  
  const log = await jenkins.build.logStream(job_name, build_number);
  let build_failed = false;

  process.stdout.write('构建中, 请稍候');

  log.on('data', function(text) {
    if (text.indexOf('Finished: FAILURE') !== -1) {
      build_failed = true;
    }
    process.stdout.write('.');
  });
  
  log.on('error', function(err) {
    console.log(`发版失败, 错误原因: 
      ${err}`);
  });
  
  log.on('end', function(err) {
    console.log('\n');
    console.log(`${build_failed ? '发版失败' : '发版成功'}`);
  });
}
