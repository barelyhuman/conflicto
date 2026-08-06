/** @type {{ id: string, title: string, message: string }[]} */
export const mockErrors = [
  {
    id: 'pull-conflict',
    title: 'Merge conflict on pull',
    message: 'Automatic merge failed; fix conflicts and then commit the result.',
  },
  {
    id: 'push-rejected',
    title: 'Push rejected',
    message: 'Updates were rejected because the remote contains work that you do not have locally.',
  },
  {
    id: 'auth-failed',
    title: 'Authentication failed',
    message: 'Unable to authenticate with the remote server. Please check your credentials.',
  },
];
