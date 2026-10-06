'use strict';

const authentication = require('./authentication');
const { addApiKey, handlePlaneErrors } = require('./lib/errors');

const projectList = require('./triggers/project_list');
const stateList = require('./triggers/state_list');
const labelList = require('./triggers/label_list');
const newWorkItem = require('./triggers/new_work_item');

module.exports = {
  version: require('./package.json').version,
  platformVersion: require('zapier-platform-core').version,

  flags: { cleanInputData: false },

  authentication,

  beforeRequest: [addApiKey],
  afterResponse: [handlePlaneErrors],

  triggers: {
    [projectList.key]: projectList,
    [stateList.key]: stateList,
    [labelList.key]: labelList,
    [newWorkItem.key]: newWorkItem,
  },

  searches: {},
  creates: {},
  resources: {},
};
